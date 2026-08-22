/* eslint-disable no-await-in-loop, no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { buildSearchIndex } = require('../discoverySearch');
const {
  INTEREST_IDS,
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  buildRecommendationFacets,
  isRecommendationClassificationValid,
  normalizeRecommendationCategory,
  normalizeRecommendationSubcategories,
} = require('../travelTaxonomy');
const { initializeAdmin } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const TARGET_VERSION = Number(RECOMMENDATION_CATALOG.schemaVersion || 0);
const DEFAULT_STATE_DIR = path.join(__dirname, '..', '.recommendation-catalog-v1');
const CATEGORY_BY_ID = Object.freeze(Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.id, item])
));
const SUBCATEGORY_BY_ID = Object.freeze(Object.fromEntries(
  RECOMMENDATION_SUBCATEGORIES.map((item) => [item.id, item])
));
const LEGACY_MAPPINGS = RECOMMENDATION_CATALOG.legacyTagMappings || {};
const PATCH_FIELDS = Object.freeze([
  'recommendationCatalogVersion',
  'category',
  'categoryId',
  'subcategoryIds',
  'catalogInterestIds',
  'facets',
  'details',
  'locationMode',
  'place',
  'mapLocation',
  'search',
]);
const GENERAL_PLACE_TYPES = new Set([
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'administrative_area_level_6',
  'administrative_area_level_7',
  'country',
  'locality',
  'political',
  'postal_code',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
]);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  if (index >= 0) return argv[index + 1];
  const prefix = `${flag}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function parseArgs(argv) {
  const rollback = valueAfter(argv, '--rollback');
  if (rollback && argv.includes('--apply')) throw new Error('Use either --apply or --rollback, not both.');
  return {
    apply: argv.includes('--apply'),
    rollback: rollback ? path.resolve(rollback) : null,
    confirmProject: valueAfter(argv, '--confirm-project'),
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || DEFAULT_STATE_DIR),
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function locationModeFor(data = {}) {
  if (data.place?.source === 'manual_pin') return 'pin';
  const types = unique([
    ...(Array.isArray(data.place?.types) ? data.place.types : []),
    ...(Array.isArray(data.place?.googleCache?.types) ? data.place.googleCache.types : []),
  ]);
  if (data.place?.placeId && (!types.length || !types.every((type) => GENERAL_PLACE_TYPES.has(type)))) {
    return 'exact';
  }
  return 'destination';
}

function directClassification(data = {}) {
  const categoryId = normalizeRecommendationCategory(data.categoryId);
  if (!categoryId) return { error: 'invalid-category' };
  const legacyTags = unique(Array.isArray(data.tags) ? data.tags : []);
  if (!legacyTags.length) return { error: 'missing-legacy-tags' };
  const subcategoryIds = [];
  for (const tagId of legacyTags) {
    const mapping = LEGACY_MAPPINGS[tagId];
    if (mapping?.strategy !== 'direct' || mapping.subcategoryIds?.length !== 1) {
      return { error: 'manual-review-required', tagIds: [tagId] };
    }
    const [subcategoryId] = mapping.subcategoryIds;
    if (SUBCATEGORY_BY_ID[subcategoryId]?.categoryId !== categoryId) {
      return { error: 'category-mismatch', tagIds: [tagId], subcategoryIds: [subcategoryId] };
    }
    subcategoryIds.push(subcategoryId);
  }
  const normalized = normalizeRecommendationSubcategories(unique(subcategoryIds), categoryId);
  if (!isRecommendationClassificationValid({ categoryId, subcategoryIds: normalized }) ||
      normalized.length !== unique(subcategoryIds).length) {
    return { error: 'invalid-direct-classification', subcategoryIds: unique(subcategoryIds) };
  }
  return { categoryId, legacyTags, subcategoryIds: normalized };
}

function buildCatalogPatch(data, classification) {
  const { categoryId, legacyTags, subcategoryIds } = classification;
  const catalogInterestIds = unique(subcategoryIds.flatMap(
    (subcategoryId) => SUBCATEGORY_BY_ID[subcategoryId]?.interestIds || []
  )).filter((interestId) => INTEREST_IDS.includes(interestId));
  const baseFacets = buildRecommendationFacets(
    { categoryId, tags: legacyTags, budget: data.budget },
    { audienceScope: 'all', audiences: [], vibes: [], environments: [], needs: [] }
  );
  const facets = {
    ...baseFacets,
    interests: unique([...(baseFacets.interests || []), ...catalogInterestIds]),
    catalogInterests: catalogInterestIds,
  };
  const locationMode = locationModeFor(data);
  const place = locationMode === 'destination' ? null : data.place;
  const patch = {
    recommendationCatalogVersion: TARGET_VERSION,
    category: CATEGORY_BY_ID[categoryId].label,
    categoryId,
    subcategoryIds,
    catalogInterestIds,
    facets,
    details: data.details && typeof data.details === 'object' && !Array.isArray(data.details)
      ? data.details
      : {},
    locationMode,
    search: buildSearchIndex({
      title: data.title,
      description: data.description,
      destination: data.destination,
      place,
      categoryIds: [categoryId],
      subcategoryIds,
      interestIds: facets.interests,
    }),
  };
  const deleteFields = locationMode === 'destination' ? ['place', 'mapLocation'] : [];
  return { patch, deleteFields };
}

function migrationEntry(snapshot) {
  const documentPath = snapshot.ref.path;
  const data = snapshot.data() || {};
  if (!/^recommendations\/[^/]+$/.test(documentPath)) return null;
  const currentVersion = Number(data.recommendationCatalogVersion || 0);
  if (currentVersion === TARGET_VERSION) return null;
  if (currentVersion > TARGET_VERSION) {
    return { kind: 'blocked', path: documentPath, reason: 'newer-catalog-version' };
  }
  const classification = directClassification(data);
  if (classification.error) {
    return {
      kind: 'blocked',
      path: documentPath,
      reason: classification.error,
      tagIds: classification.tagIds || [],
      subcategoryIds: classification.subcategoryIds || [],
    };
  }
  const { patch, deleteFields } = buildCatalogPatch(data, classification);
  return {
    kind: 'candidate',
    snapshot,
    path: documentPath,
    patch,
    deleteFields,
    categoryId: classification.categoryId,
    subcategoryIds: classification.subcategoryIds,
    locationMode: patch.locationMode,
  };
}

function encodeValue(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return { __type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __type: 'DocumentReference', path: value.path };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeValue(nested)]));
  }
  return value;
}

function decodeValue(value, firestore) {
  if (Array.isArray(value)) return value.map((nested) => decodeValue(nested, firestore));
  if (!value || typeof value !== 'object') return value;
  if (value.__type === 'Timestamp') return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  if (value.__type === 'GeoPoint') return new admin.firestore.GeoPoint(value.latitude, value.longitude);
  if (value.__type === 'DocumentReference') return firestore.doc(value.path);
  return Object.fromEntries(Object.entries(value).map(
    ([key, nested]) => [key, decodeValue(nested, firestore)]
  ));
}

function captureBefore(data) {
  return Object.fromEntries(PATCH_FIELDS.map((field) => [field, {
    present: Object.hasOwn(data, field),
    ...(Object.hasOwn(data, field) ? { value: encodeValue(data[field]) } : {}),
  }]));
}

function materializePatch(entry) {
  const patch = { ...entry.patch };
  for (const field of entry.deleteFields) patch[field] = admin.firestore.FieldValue.delete();
  return patch;
}

function writeManifest(stateDir, manifest) {
  fs.mkdirSync(stateDir, { recursive: true });
  const stamp = manifest.createdAt.replace(/[:.]/g, '-');
  const manifestPath = path.join(stateDir, `recommendation-catalog-v1-${stamp}.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600,
  });
  return manifestPath;
}

async function loadDocuments(firestore) {
  return (await firestore.collection('recommendations').get()).docs;
}

async function migrateRecommendationCatalog({
  firestore,
  documents,
  apply = false,
  stateDir = DEFAULT_STATE_DIR,
  manifestWriter = writeManifest,
}) {
  const snapshots = documents || await loadDocuments(firestore);
  const entries = snapshots.map(migrationEntry).filter(Boolean);
  const candidates = entries.filter((entry) => entry.kind === 'candidate');
  const blocked = entries.filter((entry) => entry.kind === 'blocked');
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: snapshots.length,
    alreadyMigrated: snapshots.length - entries.length,
    candidates: candidates.length,
    blocked,
    classifications: candidates.map((entry) => ({
      path: entry.path,
      categoryId: entry.categoryId,
      subcategoryIds: entry.subcategoryIds,
      locationMode: entry.locationMode,
    })),
    applied: 0,
    conflicts: 0,
    manifestPath: null,
  };
  if (!apply) return summary;
  if (blocked.length) throw new Error(`Migration blocked by ${blocked.length} recommendation(s).`);
  if (!candidates.length) return summary;

  const manifest = {
    schemaVersion: 1,
    recommendationCatalogVersion: TARGET_VERSION,
    createdAt: new Date().toISOString(),
    projectId: firestore.projectId || null,
    documents: candidates.map((entry) => ({
      path: entry.path,
      before: captureBefore(entry.snapshot.data() || {}),
    })),
  };
  summary.manifestPath = manifestWriter(stateDir, manifest);

  for (const candidate of candidates) {
    const applied = await firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.snapshot.ref);
      if (!current.exists) return false;
      if (candidate.snapshot.updateTime?.isEqual &&
          !candidate.snapshot.updateTime.isEqual(current.updateTime)) return null;
      const refreshed = migrationEntry(current);
      if (!refreshed) return false;
      if (refreshed.kind === 'blocked') return null;
      transaction.update(current.ref, materializePatch(refreshed));
      return true;
    });
    if (applied === null) summary.conflicts += 1;
    else if (applied) summary.applied += 1;
  }
  return summary;
}

async function rollbackRecommendationCatalog({ firestore, manifest }) {
  if (manifest?.projectId !== PROJECT_ID ||
      manifest?.recommendationCatalogVersion !== TARGET_VERSION ||
      !Array.isArray(manifest.documents)) {
    throw new Error('Invalid recommendation catalog rollback manifest.');
  }
  let restored = 0;
  for (const entry of manifest.documents) {
    if (!/^recommendations\/[^/]+$/.test(entry.path)) {
      throw new Error(`Invalid rollback document path: ${entry.path}`);
    }
    const patch = {};
    for (const field of PATCH_FIELDS) {
      const previous = entry.before?.[field];
      patch[field] = previous?.present
        ? decodeValue(previous.value, firestore)
        : admin.firestore.FieldValue.delete();
    }
    await firestore.doc(entry.path).update(patch);
    restored += 1;
  }
  return { mode: 'rollback', restored };
}

function assertProductionConfirmation(options, firestore) {
  if (!options.apply && !options.rollback) return;
  if (options.confirmProject !== PROJECT_ID || firestore.projectId !== PROJECT_ID) {
    throw new Error(`Production writes require --confirm-project=${PROJECT_ID}.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin, { projectId: PROJECT_ID });
  const firestore = admin.firestore();
  assertProductionConfirmation(options, firestore);
  if (options.rollback) {
    const manifest = JSON.parse(fs.readFileSync(options.rollback, 'utf8'));
    console.log(JSON.stringify(await rollbackRecommendationCatalog({ firestore, manifest }), null, 2));
    return;
  }
  console.log(`Recommendation catalog v1 migration: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  const summary = await migrateRecommendationCatalog({ firestore, ...options });
  console.log(JSON.stringify(summary, null, 2));
  if (!options.apply && summary.candidates) {
    console.log('No data changed. Review every classification, then re-run with apply and project confirmation.');
  }
  if (summary.blocked.length || summary.conflicts) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Recommendation catalog v1 migration failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  PATCH_FIELDS,
  buildCatalogPatch,
  directClassification,
  locationModeFor,
  migrateRecommendationCatalog,
  migrationEntry,
  parseArgs,
  rollbackRecommendationCatalog,
};
