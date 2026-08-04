/* eslint-disable no-await-in-loop, no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { initializeAdmin } = require('./localCredentials');
const {
  analyzeTagValues,
  buildRecommendationFacets,
  CATEGORY_IDS,
  getCategoryLabel,
  INTEREST_IDS,
  NEED_IDS,
  normalizeBudget,
  normalizeCategoryId,
  POST_BUDGET_IDS,
  TAG_IDS,
  tagsMatchCategory,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
} = require('../travelTaxonomy');

const MANIFEST_VERSION = 1;
const DEFAULT_STATE_DIR = path.join(__dirname, '..', '.recommendation-curation');
const TRACKED_FIELDS = Object.freeze([
  'title',
  'description',
  'category',
  'categoryId',
  'tags',
  'budget',
  'facets',
  'status',
  'destination',
  'place',
]);
const OVERRIDE_FIELDS = new Set(TRACKED_FIELDS.filter((field) => field !== 'category'));
const REMOVABLE_FIELDS = new Set(['place']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const SOURCE_TYPES = new Set(['official', 'google_places', 'author_content', 'other']);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    apply: argv.includes('--apply'),
    resume: argv.includes('--resume'),
    rollback: valueAfter(argv, '--rollback'),
    manifest: valueAfter(argv, '--manifest'),
    overrides: valueAfter(argv, '--overrides'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : Number.POSITIVE_INFINITY,
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || DEFAULT_STATE_DIR),
  };
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function updateTimeIso(snapshot) {
  return snapshot?.updateTime?.toDate?.().toISOString?.() || null;
}

function matchesExpectedUpdateTime(snapshot, expectedUpdateTime) {
  return Boolean(expectedUpdateTime) && updateTimeIso(snapshot) === expectedUpdateTime;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function equal(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function selectTrackedFields(data = {}) {
  const selected = {};
  for (const field of TRACKED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) selected[field] = clone(data[field]);
  }
  return selected;
}

function changedFields(before, after) {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((field) => !equal(before[field], after[field]));
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizeSources(values) {
  if (!Array.isArray(values)) return [];
  return values.map((source) => ({
    type: source?.type,
    url: source?.url,
    checkedAt: source?.checkedAt,
    note: typeof source?.note === 'string' ? source.note.trim() : '',
  }));
}

function validateSources(sources) {
  const errors = [];
  for (const source of sources) {
    if (!SOURCE_TYPES.has(source.type)) errors.push('source-type');
    if (!isHttpsUrl(source.url)) errors.push('source-url');
    if (!isIsoDate(source.checkedAt)) errors.push('source-checked-at');
  }
  return errors;
}

function normalizeCoordinates(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat ?? value.latitude);
  const lng = Number(value.lng ?? value.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function validateLocation(after, location = {}) {
  const errors = [];
  const precision = location.precision || (after.place?.coordinates ? 'exact' : 'city');
  if (!['exact', 'city'].includes(precision)) return ['location-precision'];

  if (precision === 'exact') {
    const placeId = typeof after.place?.placeId === 'string' ? after.place.placeId.trim() : '';
    if (!placeId || placeId !== location.verifiedPlaceId) errors.push('exact-place-id');
    if (!normalizeCoordinates(after.place?.coordinates)) errors.push('exact-coordinates');
    if (!isIsoDate(location.verifiedAt)) errors.push('exact-verified-at');
    if (!isHttpsUrl(location.sourceUrl)) errors.push('exact-source-url');
  } else if (after.place?.coordinates || after.place?.placeId) {
    errors.push('city-level-has-exact-place');
  }
  return errors;
}

function validateVolatileFacts(volatileFacts, sources) {
  if (!Array.isArray(volatileFacts) || volatileFacts.length === 0) return [];
  const hasOfficialSource = sources.some((source) => (
    source.type === 'official' && isHttpsUrl(source.url) && isIsoDate(source.checkedAt)
  ));
  return hasOfficialSource ? [] : ['volatile-fact-without-official-source'];
}

function normalizeOverride(raw = {}) {
  const patch = raw.patch && typeof raw.patch === 'object' && !Array.isArray(raw.patch)
    ? raw.patch
    : {};
  const unsupported = Object.keys(patch).filter((field) => !OVERRIDE_FIELDS.has(field));
  if (unsupported.length) throw new Error(`Unsupported override fields: ${unsupported.join(', ')}`);
  const removeFields = Array.isArray(raw.removeFields) ? raw.removeFields : [];
  if (removeFields.some((field) => !REMOVABLE_FIELDS.has(field))) {
    throw new Error('Only place may be removed by a curation override.');
  }
  const confidence = raw.confidence || 'high';
  if (!CONFIDENCE_LEVELS.has(confidence)) throw new Error('Invalid curation confidence.');
  return {
    id: typeof raw.id === 'string' ? raw.id.trim() : '',
    patch: clone(patch),
    removeFields: Array.from(new Set(removeFields)),
    confidence,
    reason: typeof raw.reason === 'string' ? raw.reason.trim() : '',
    sources: normalizeSources(raw.sources),
    location: raw.location && typeof raw.location === 'object' ? clone(raw.location) : {},
    volatileFacts: Array.isArray(raw.volatileFacts) ? clone(raw.volatileFacts) : [],
    unresolved: raw.unresolved === true,
    deactivation: raw.deactivation && typeof raw.deactivation === 'object'
      ? clone(raw.deactivation)
      : {},
  };
}

function canonicalizeRecommendation(data = {}, override = normalizeOverride()) {
  const combined = { ...selectTrackedFields(data), ...override.patch };
  for (const field of override.removeFields) delete combined[field];

  const categoryId = normalizeCategoryId(combined.categoryId || combined.category);
  if (!CATEGORY_IDS.includes(categoryId)) throw new Error('Recommendation category is invalid.');
  const tagAnalysis = analyzeTagValues(combined.tags || []);
  if (!tagAnalysis.recognized || !tagsMatchCategory(combined.tags || [], categoryId)) {
    throw new Error('Recommendation tags are invalid for the category.');
  }
  const budget = normalizeBudget(combined.budget, { allowFlexible: false }) || tagAnalysis.budgetLevel;
  if (budget && !POST_BUDGET_IDS.includes(budget)) throw new Error('Recommendation budget is invalid.');

  const submittedFacets = combined.facets && typeof combined.facets === 'object'
    ? combined.facets
    : {};
  const facets = buildRecommendationFacets(
    { ...combined, categoryId, tags: combined.tags || [], budget },
    submittedFacets
  );
  const after = {
    ...combined,
    title: String(combined.title || '').trim(),
    description: String(combined.description || '').trim(),
    category: getCategoryLabel(categoryId),
    categoryId,
    tags: tagAnalysis.tagIds,
    budget,
    facets,
    status: combined.status === 'inactive' ? 'inactive' : 'active',
  };
  if (!after.title || !after.description) throw new Error('Recommendation title and description are required.');
  return selectTrackedFields(after);
}

function validateCanonicalFacets(facets = {}) {
  const valuesAllowed = (values, allowed) => Array.isArray(values) &&
    values.every((value) => allowed.includes(value));
  const errors = [];
  if (!valuesAllowed(facets.interests, INTEREST_IDS)) errors.push('facet-interests');
  if (!valuesAllowed(facets.audiences, TRAVEL_PARTY_IDS)) errors.push('facet-audiences');
  if (!valuesAllowed(facets.vibes, VIBE_IDS)) errors.push('facet-vibes');
  if (!valuesAllowed(facets.needs, NEED_IDS)) errors.push('facet-needs');
  if (facets.budgetLevel && !POST_BUDGET_IDS.includes(facets.budgetLevel)) {
    errors.push('facet-budget');
  }
  return errors;
}

function validateManifestEntry(entry) {
  const errors = [];
  if (!entry.id || entry.path !== `recommendations/${entry.id}`) errors.push('document-path');
  if (!isIsoDate(entry.expectedUpdateTime)) errors.push('expected-update-time');
  if (!CONFIDENCE_LEVELS.has(entry.confidence)) errors.push('confidence');
  if (!entry.reason) errors.push('reason');
  errors.push(...validateSources(entry.sources || []));
  errors.push(...validateCanonicalFacets(entry.after?.facets));
  errors.push(...validateLocation(entry.after || {}, entry.location || {}));
  errors.push(...validateVolatileFacts(entry.volatileFacts, entry.sources || []));

  const newNeeds = (entry.after?.facets?.needs || [])
    .filter((need) => !(entry.before?.facets?.needs || []).includes(need))
    .filter((need) => !analyzeTagValues(entry.before?.tags || []).needs.includes(need));
  if (newNeeds.length && !(entry.sources || []).some((source) => source.type === 'official')) {
    errors.push('new-practical-needs-without-official-source');
  }
  if (entry.before?.status !== 'inactive' && entry.after?.status === 'inactive' &&
      entry.deactivation?.placeholder !== true) {
    errors.push('inactive-without-placeholder-confirmation');
  }
  return Array.from(new Set(errors));
}

function buildManifestEntry(snapshot, overrideRaw = {}) {
  const override = normalizeOverride(overrideRaw);
  const before = selectTrackedFields(snapshot.data());
  const after = canonicalizeRecommendation(before, override);
  const changes = changedFields(before, after);
  const inferredLocation = override.location?.precision
    ? override.location
    : (after.place?.coordinates && after.place?.placeId
      ? {
          precision: 'exact',
          verifiedPlaceId: after.place.placeId,
          verifiedAt: new Date().toISOString(),
          sourceUrl: after.place.url || 'https://www.google.com/maps',
        }
      : { precision: 'city' });
  const entry = {
    id: snapshot.id,
    path: snapshot.ref.path,
    expectedUpdateTime: updateTimeIso(snapshot),
    before,
    after,
    changes,
    sources: override.sources,
    confidence: override.confidence,
    reason: override.reason || (changes.length ? 'Canonical taxonomy normalization.' : 'Reviewed; no change.'),
    location: inferredLocation,
    volatileFacts: override.volatileFacts,
    deactivation: override.deactivation,
  };
  return { entry, errors: validateManifestEntry(entry), unresolved: override.unresolved };
}

function cityPath(data = {}) {
  const countryId = data.destination?.countryId;
  const cityId = data.destination?.cityId;
  return countryId && cityId ? `countries/${countryId}/cities/${cityId}` : null;
}

function getCityCountDeltas(before = {}, after = {}) {
  const deltas = new Map();
  const add = (target, amount) => {
    if (target && amount) deltas.set(target, (deltas.get(target) || 0) + amount);
  };
  const beforeActive = before.status === 'active';
  const afterActive = after.status === 'active';
  const beforeCity = cityPath(before);
  const afterCity = cityPath(after);
  if (beforeActive) add(beforeCity, -1);
  if (afterActive) add(afterCity, 1);
  return new Map(Array.from(deltas.entries()).filter(([, delta]) => delta !== 0));
}

function buildFieldPatch(before, after, fieldValue = admin.firestore.FieldValue) {
  const patch = {};
  for (const field of changedFields(before, after)) {
    patch[field] = Object.prototype.hasOwnProperty.call(after, field)
      ? clone(after[field])
      : fieldValue.delete();
  }
  return patch;
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function loadOverrides(filePath) {
  if (!filePath) return new Map();
  const raw = readJson(filePath);
  const values = Array.isArray(raw) ? raw : raw.recommendations;
  if (!Array.isArray(values)) throw new Error('Overrides must be an array or { recommendations: [] }.');
  const output = new Map();
  for (const rawOverride of values) {
    const override = normalizeOverride(rawOverride);
    if (!override.id) throw new Error('Every override requires an id.');
    if (output.has(override.id)) throw new Error(`Duplicate override for ${override.id}.`);
    output.set(override.id, override);
  }
  return output;
}

async function buildManifest(db, options) {
  const overrides = loadOverrides(options.overrides);
  let query = db.collection('recommendations')
    .orderBy(admin.firestore.FieldPath.documentId());
  if (Number.isFinite(options.limit)) query = query.limit(options.limit);
  const snapshot = await query.get();
  const entries = [];
  const invalid = [];
  const unresolved = [];
  const seen = new Set();

  for (const document of snapshot.docs) {
    const override = overrides.get(document.id) || {};
    seen.add(document.id);
    try {
      const result = buildManifestEntry(document, override);
      if (result.errors.length) invalid.push({ id: document.id, errors: result.errors });
      if (result.unresolved || result.entry.confidence !== 'high') {
        unresolved.push({ id: document.id, reason: result.entry.reason });
      }
      if (result.entry.changes.length) entries.push(result.entry);
    } catch (error) {
      invalid.push({ id: document.id, errors: [error.message] });
    }
  }
  for (const id of overrides.keys()) {
    if (!seen.has(id)) invalid.push({ id, errors: ['override-document-not-found'] });
  }

  return {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    projectId: process.env.GCLOUD_PROJECT || 'planli-f0b12',
    scanned: snapshot.size,
    entries,
    invalid,
    unresolved,
  };
}

async function hasEngagement(db, entry) {
  const likeCount = Number(entry.before?.stats?.likeCount || 0);
  const commentCount = Number(entry.before?.stats?.commentCount || 0);
  if (likeCount > 0 || commentCount > 0) return true;
  const recommendationRef = db.doc(entry.path);
  const [likes, comments, favorites] = await Promise.all([
    recommendationRef.collection('likes').limit(1).get(),
    recommendationRef.collection('comments').limit(1).get(),
    db.collectionGroup('favorites').where('target.path', '==', entry.path).limit(1).get(),
  ]);
  return !likes.empty || !comments.empty || !favorites.empty;
}

async function commitEntry(db, entry, before, after) {
  const deltas = getCityCountDeltas(before, after);
  await db.runTransaction(async (transaction) => {
    const recommendationRef = db.doc(entry.path);
    const current = await transaction.get(recommendationRef);
    if (!current.exists) throw new Error('precondition:not-found');
    if (!matchesExpectedUpdateTime(current, entry.expectedUpdateTime)) {
      throw new Error('precondition:update-time');
    }

    const citySnapshots = new Map();
    for (const targetPath of deltas.keys()) {
      const cityRef = db.doc(targetPath);
      const citySnapshot = await transaction.get(cityRef);
      if (!citySnapshot.exists) throw new Error(`precondition:missing-city:${targetPath}`);
      citySnapshots.set(targetPath, citySnapshot);
    }

    transaction.update(recommendationRef, {
      ...buildFieldPatch(before, after),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    for (const [targetPath, delta] of deltas.entries()) {
      const citySnapshot = citySnapshots.get(targetPath);
      const count = Number(citySnapshot.data()?.stats?.recommendationCount || 0);
      transaction.update(citySnapshot.ref, {
        'stats.recommendationCount': Math.max(0, count + delta),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}

function validateManifest(manifest) {
  if (manifest?.version !== MANIFEST_VERSION || !Array.isArray(manifest.entries)) {
    throw new Error('Unsupported curation manifest.');
  }
  const invalid = manifest.entries
    .map((entry) => ({ id: entry.id, errors: validateManifestEntry(entry) }))
    .filter((entry) => entry.errors.length);
  if (invalid.length) throw new Error(`Manifest validation failed: ${JSON.stringify(invalid)}`);
}

async function applyManifest(db, options, manifest) {
  validateManifest(manifest);
  const manifestDigest = digest(manifest);
  const checkpointPath = path.join(options.stateDir, 'checkpoint.json');
  const checkpoint = options.resume && fs.existsSync(checkpointPath)
    ? readJson(checkpointPath)
    : { manifestDigest, processed: [] };
  if (checkpoint.manifestDigest !== manifestDigest) {
    throw new Error('Resume checkpoint belongs to a different manifest.');
  }
  const processed = new Set(checkpoint.processed || []);
  const rollbackPath = path.join(options.stateDir, `rollback-${timestampForFile()}.jsonl`);
  const report = { mode: 'apply', applied: [], skipped: [], failed: [], rollbackPath };

  for (const entry of manifest.entries) {
    if (processed.has(entry.path)) continue;
    if (entry.confidence !== 'high') {
      report.skipped.push({ path: entry.path, reason: 'confidence' });
      processed.add(entry.path);
      writeJson(checkpointPath, { manifestDigest, processed: Array.from(processed) });
      continue;
    }
    if (entry.before?.status !== 'inactive' && entry.after?.status === 'inactive' &&
        await hasEngagement(db, entry)) {
      report.skipped.push({ path: entry.path, reason: 'engagement' });
      processed.add(entry.path);
      writeJson(checkpointPath, { manifestDigest, processed: Array.from(processed) });
      continue;
    }
    try {
      await commitEntry(db, entry, entry.before, entry.after);
      const afterSnapshot = await db.doc(entry.path).get();
      appendJsonLine(rollbackPath, {
        path: entry.path,
        expectedUpdateTime: updateTimeIso(afterSnapshot),
        before: entry.before,
        after: entry.after,
      });
      report.applied.push(entry.path);
    } catch (error) {
      const reason = String(error.message || error);
      if (reason.startsWith('precondition:')) report.skipped.push({ path: entry.path, reason });
      else report.failed.push({ path: entry.path, reason });
    }
    processed.add(entry.path);
    writeJson(checkpointPath, { manifestDigest, processed: Array.from(processed) });
  }
  writeJson(path.join(options.stateDir, 'apply-report.json'), report);
  if (report.failed.length) throw new Error('Curation apply completed with failures.');
  return report;
}

async function rollback(db, options) {
  const lines = fs.readFileSync(path.resolve(options.rollback), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .reverse()
    .map((line) => JSON.parse(line));
  const report = { mode: 'rollback', restored: [], skipped: [], failed: [] };
  for (const entry of lines) {
    const rollbackEntry = {
      ...entry,
      id: entry.path.split('/').pop(),
      expectedUpdateTime: entry.expectedUpdateTime,
    };
    if (entry.after?.status !== 'inactive' && entry.before?.status === 'inactive' &&
        await hasEngagement(db, { ...rollbackEntry, before: entry.after })) {
      report.skipped.push({ path: entry.path, reason: 'engagement' });
      continue;
    }
    try {
      await commitEntry(db, rollbackEntry, entry.after, entry.before);
      report.restored.push(entry.path);
    } catch (error) {
      const reason = String(error.message || error);
      if (reason.startsWith('precondition:')) report.skipped.push({ path: entry.path, reason });
      else report.failed.push({ path: entry.path, reason });
    }
  }
  writeJson(path.join(options.stateDir, 'rollback-report.json'), report);
  if (report.failed.length) throw new Error('Curation rollback completed with failures.');
  return report;
}

async function run(options) {
  if (options.apply && options.overrides) {
    throw new Error('Apply requires a frozen --manifest, not --overrides.');
  }
  if (options.apply && !options.manifest && !options.rollback) {
    throw new Error('Apply requires --manifest or --rollback.');
  }
  if (options.rollback && !options.apply) throw new Error('Rollback requires --apply.');

  initializeAdmin(admin);
  const db = admin.firestore();
  fs.mkdirSync(options.stateDir, { recursive: true });
  if (options.rollback) return rollback(db, options);
  if (options.apply) return applyManifest(db, options, readJson(options.manifest));

  const manifest = await buildManifest(db, options);
  const manifestPath = path.join(
    options.stateDir,
    'manifests',
    `manifest-${timestampForFile()}.json`
  );
  writeJson(manifestPath, manifest);
  const report = {
    mode: 'dry-run',
    scanned: manifest.scanned,
    proposed: manifest.entries.length,
    invalid: manifest.invalid,
    unresolved: manifest.unresolved,
    manifestPath,
  };
  writeJson(path.join(options.stateDir, 'dry-run-report.json'), report);
  return report;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildFieldPatch,
  buildManifestEntry,
  canonicalizeRecommendation,
  changedFields,
  getCityCountDeltas,
  matchesExpectedUpdateTime,
  normalizeOverride,
  parseArgs,
  selectTrackedFields,
  validateLocation,
  validateManifestEntry,
  validateVolatileFacts,
};
