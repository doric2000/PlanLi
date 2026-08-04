/* eslint-disable no-await-in-loop, no-console */
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
  normalizeSmartProfile,
  POST_BUDGET_IDS,
  TAG_IDS,
  tagsMatchCategory,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
} = require('../travelTaxonomy');
const {
  applyPersonalizationSignal,
  normalizePersonalization,
} = require('../personalizationService');

const PAGE_SIZE = 250;
const HISTORY_SEED_VERSION = 'travel-preferences-v1';
const DEFAULT_STATE_DIR = path.join(
  __dirname,
  '..',
  '.database-canonical-migration',
  'travel-personalization'
);

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
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : Number.POSITIVE_INFINITY,
    stateDir: path.resolve(valueAfter(argv, '--state-dir') || DEFAULT_STATE_DIR),
  };
}

function encode(value) {
  if (value === undefined) return { __type: 'undefined' };
  if (value instanceof admin.firestore.Timestamp) {
    return { __type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __type: 'reference', path: value.path };
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)]));
  }
  return value;
}

function decode(value, db) {
  if (Array.isArray(value)) return value.map((entry) => decode(entry, db));
  if (!value || typeof value !== 'object') return value;
  if (value.__type === 'undefined') return undefined;
  if (value.__type === 'timestamp') {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds);
  }
  if (value.__type === 'geopoint') {
    return new admin.firestore.GeoPoint(value.latitude, value.longitude);
  }
  if (value.__type === 'reference') return db.doc(value.path);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry, db)]));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function appendRollback(filePath, documentPath, before) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify({ path: documentPath, before: encode(before) })}\n`);
}

function migratedSmartProfile(raw = {}) {
  const canonical = normalizeSmartProfile(raw);
  const completed = Boolean(
    raw.completedAt && canonical.interests.length >= 3 && canonical.budget &&
    canonical.travelParties.length >= 1
  );
  return {
    setupRequired: completed ? false : raw.setupRequired === true,
    completedAt: completed ? raw.completedAt : null,
    ...canonical,
  };
}

function migratedRecommendation(data = {}) {
  const categoryId = normalizeCategoryId(data.categoryId || data.category);
  const tagAnalysis = analyzeTagValues(data.tags);
  const budget = normalizeBudget(data.budget, { allowFlexible: false }) || tagAnalysis.budgetLevel;
  return {
    categoryId,
    category: getCategoryLabel(categoryId),
    tags: tagAnalysis.tagIds,
    budget,
    facets: buildRecommendationFacets(
      { ...data, categoryId, tags: data.tags || [], budget },
      data.facets || {}
    ),
  };
}

function auditCanonicalPatch(stageName, patch) {
  const errors = [];
  const arraysUseOnly = (values, allowed) => (
    Array.isArray(values) && values.every((value) => allowed.includes(value))
  );
  if (stageName === 'users') {
    const profile = patch.smartProfile;
    if (!profile || Object.prototype.hasOwnProperty.call(profile, 'pace')) errors.push('profile-shape');
    if (!arraysUseOnly(profile?.interests, INTEREST_IDS)) errors.push('profile-interests');
    if (!arraysUseOnly(profile?.travelParties, TRAVEL_PARTY_IDS)) errors.push('profile-parties');
    if (!arraysUseOnly(profile?.vibe, VIBE_IDS)) errors.push('profile-vibes');
    if (!arraysUseOnly(profile?.needs, NEED_IDS)) errors.push('profile-needs');
  }
  if (stageName === 'recommendations') {
    if (!CATEGORY_IDS.includes(patch.categoryId)) errors.push('recommendation-category');
    if (!arraysUseOnly(patch.tags, TAG_IDS)) errors.push('recommendation-tags');
    if (patch.budget && !POST_BUDGET_IDS.includes(patch.budget)) errors.push('recommendation-budget');
    if (!arraysUseOnly(patch.facets?.interests, INTEREST_IDS)) errors.push('facet-interests');
    if (!arraysUseOnly(patch.facets?.audiences, TRAVEL_PARTY_IDS)) errors.push('facet-audiences');
    if (!arraysUseOnly(patch.facets?.vibes, VIBE_IDS)) errors.push('facet-vibes');
    if (!arraysUseOnly(patch.facets?.needs, NEED_IDS)) errors.push('facet-needs');
  }
  return errors;
}

function changed(before, after) {
  return JSON.stringify(encode(before)) !== JSON.stringify(encode(after));
}

async function readCollection(db, collectionPath, limit, startAfterId = null) {
  let query = db.collection(collectionPath)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(Math.min(PAGE_SIZE, limit));
  if (startAfterId) query = query.startAfter(startAfterId);
  return query.get();
}

async function migrateProfilesAndFacets(db, options, checkpoint, rollbackPath, report) {
  const stages = [
    {
      name: 'users',
      path: 'users',
      transform: (data) => ({ smartProfile: migratedSmartProfile(data.smartProfile || {}) }),
    },
    {
      name: 'recommendations',
      path: 'recommendations',
      transform: migratedRecommendation,
    },
  ];

  for (const stage of stages) {
    let processed = 0;
    let lastId = options.resume ? checkpoint[stage.name]?.lastId || null : null;
    while (processed < options.limit) {
      const snapshot = await readCollection(db, stage.path, options.limit - processed, lastId);
      if (snapshot.empty) break;
      const batch = db.batch();
      let writes = 0;
      for (const document of snapshot.docs) {
        const data = document.data();
        if (stage.name === 'recommendations' && !analyzeTagValues(data.tags).recognized) {
          if (report.audit.errors.length < 50) {
            report.audit.errors.push({ path: document.ref.path, errors: ['unrecognized-legacy-tags'] });
          }
          continue;
        }
        if (stage.name === 'recommendations' &&
          !tagsMatchCategory(data.tags, data.categoryId || data.category)) {
          if (report.audit.errors.length < 50) {
            report.audit.errors.push({ path: document.ref.path, errors: ['tag-category-mismatch'] });
          }
          continue;
        }
        const next = stage.transform(data);
        const before = Object.fromEntries(Object.keys(next).map((field) => [field, data[field]]));
        const auditErrors = auditCanonicalPatch(stage.name, next);
        if (auditErrors.length) {
          if (report.audit.errors.length < 50) {
            report.audit.errors.push({ path: document.ref.path, errors: auditErrors });
          }
          continue;
        }
        report.audit.checked += 1;
        if (changed(before, next)) {
          report[stage.name].changed += 1;
          if (options.apply) {
            appendRollback(rollbackPath, document.ref.path, before);
            batch.update(document.ref, {
              ...next,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            writes += 1;
          }
        }
      }
      if (options.apply && writes) await batch.commit();
      processed += snapshot.size;
      report[stage.name].scanned += snapshot.size;
      lastId = snapshot.docs[snapshot.docs.length - 1].id;
      checkpoint[stage.name] = { lastId, complete: snapshot.size < PAGE_SIZE };
      if (options.apply) writeJson(path.join(options.stateDir, 'checkpoint.json'), checkpoint);
      if (snapshot.size < PAGE_SIZE) break;
    }
  }
}

async function seedActivity(db, options, checkpoint, rollbackPath, report) {
  const byUser = new Map();
  const add = (userId, targetPath, delta, action) => {
    if (!userId || !targetPath) return;
    const entries = byUser.get(userId) || [];
    if (entries.length < options.limit) entries.push({ targetPath, delta, action });
    byUser.set(userId, entries);
  };

  const [favorites, likes] = await Promise.all([
    db.collectionGroup('favorites').get(),
    db.collectionGroup('likes').get(),
  ]);
  favorites.docs.forEach((document) => {
    const data = document.data();
    const userId = data.ownerId || document.ref.parent.parent?.id;
    const targetPath = data.target?.path;
    const isRecommendation = typeof targetPath === 'string' && targetPath.startsWith('recommendations/');
    const isCity = typeof targetPath === 'string' && /^countries\/[^/]+\/cities\/[^/]+$/.test(targetPath);
    if (!isRecommendation && !isCity) return;
    const delta = data.type === 'city' || targetPath?.includes('/cities/') ? 6 : 5;
    add(userId, targetPath, delta, 'historical-favorite');
  });
  likes.docs.forEach((document) => {
    const data = document.data();
    const targetRef = document.ref.parent.parent;
    if (targetRef?.parent?.id === 'recommendations') {
      add(data.userId || document.id, targetRef.path, 3, 'historical-like');
    }
  });

  const users = Array.from(byUser.entries()).sort(([left], [right]) => left.localeCompare(right));
  for (const [userId, signals] of users) {
    if (options.resume && checkpoint.activity?.lastUserId && userId <= checkpoint.activity.lastUserId) {
      continue;
    }
    const userRef = db.doc(`users/${userId}`);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) continue;
    const existingPersonalization = userSnapshot.data().personalization;
    if (existingPersonalization?.historySeedVersion === HISTORY_SEED_VERSION) {
      checkpoint.activity = { lastUserId: userId };
      continue;
    }
    let personalization = normalizePersonalization(existingPersonalization, Date.now());
    for (const signal of signals) {
      const target = await db.doc(signal.targetPath).get();
      if (!target.exists) continue;
      personalization = applyPersonalizationSignal(
        personalization,
        {
          id: target.id,
          path: target.ref.path,
          type: target.ref.parent.id === 'recommendations' ? 'recommendation' : 'city',
          ...(target.ref.parent.id === 'cities'
            ? { countryId: target.ref.parent.parent?.id }
            : {}),
        },
        target.data(),
        signal.delta,
        signal.action,
        Date.now()
      ).personalization;
      report.activity.signals += 1;
    }
    if (options.apply && signals.length) {
      personalization.historySeedVersion = HISTORY_SEED_VERSION;
      appendRollback(rollbackPath, userRef.path, { personalization: existingPersonalization });
      await userRef.update({
        personalization,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      report.activity.usersChanged += 1;
      checkpoint.activity = { lastUserId: userId };
      writeJson(path.join(options.stateDir, 'checkpoint.json'), checkpoint);
    }
  }
  report.activity.usersScanned = byUser.size;
}

async function rollback(db, filePath) {
  const lines = fs.readFileSync(path.resolve(filePath), 'utf8').split(/\r?\n/).filter(Boolean).reverse();
  for (const line of lines) {
    const entry = JSON.parse(line);
    const before = decode(entry.before, db);
    const update = {};
    for (const [field, value] of Object.entries(before)) {
      update[field] = value === undefined ? admin.firestore.FieldValue.delete() : value;
    }
    await db.doc(entry.path).update(update);
  }
  return { restored: lines.length };
}

async function run(options) {
  initializeAdmin(admin);
  const db = admin.firestore();
  if (options.rollback) {
    if (!options.apply) throw new Error('Rollback requires --apply.');
    return { mode: 'rollback', ...(await rollback(db, options.rollback)) };
  }

  fs.mkdirSync(options.stateDir, { recursive: true });
  const checkpointPath = path.join(options.stateDir, 'checkpoint.json');
  const checkpoint = options.resume && fs.existsSync(checkpointPath)
    ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
    : {};
  const rollbackPath = path.join(
    options.stateDir,
    `rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
  );
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    users: { scanned: 0, changed: 0 },
    recommendations: { scanned: 0, changed: 0 },
    activity: { usersScanned: 0, usersChanged: 0, signals: 0 },
    audit: { checked: 0, passed: false, errors: [] },
    rollbackPath: options.apply ? rollbackPath : null,
  };
  await migrateProfilesAndFacets(db, options, checkpoint, rollbackPath, report);
  await seedActivity(db, options, checkpoint, rollbackPath, report);
  report.audit.passed = report.audit.errors.length === 0;
  writeJson(path.join(options.stateDir, 'report.json'), report);
  if (options.apply && !report.audit.passed) {
    throw new Error('Post-migration canonical audit failed. Review the local report and rollback data.');
  }
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
  auditCanonicalPatch,
  migratedRecommendation,
  migratedSmartProfile,
  parseArgs,
  rollback,
  run,
};
