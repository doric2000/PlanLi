/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { isDeepStrictEqual } = require('node:util');
const { buildFavoritePreview } = require('../socialService');
const { initializeAdmin } = require('./localCredentials');

const USER_PAGE_SIZE = 100;
const READ_BATCH_SIZE = 150;

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    apply: argv.includes('--apply'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : Number.POSITIVE_INFINITY,
  };
}

function resolveRecommendationTarget(data) {
  const type = data?.target?.type || data?.type;
  if (type !== 'recommendation' && type !== 'recommendations') return null;
  const id = data?.target?.id || data?.id;
  if (typeof id !== 'string' || !id.trim()) {
    return { status: 'malformed', reason: 'missing-id' };
  }
  return {
    status: 'known',
    target: {
      type: 'recommendation',
      id,
      path: data?.target?.path || `recommendations/${id}`,
    },
  };
}

async function updateFavoriteRefs(firestore, updates) {
  if (!updates.length) return 0;
  const batch = firestore.batch();
  updates.forEach(({ ref, preview, sourceUpdatedAt }) => {
    batch.update(ref, { preview, sourceUpdatedAt });
  });
  await batch.commit();
  return updates.length;
}

async function inspectRecommendationFavorites({
  firestore,
  records,
  apply = false,
  serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp(),
  log = console,
}) {
  const candidates = [];
  let skipped = 0;
  let malformed = 0;

  records.forEach((record) => {
    const resolved = resolveRecommendationTarget(record.data);
    if (!resolved) {
      skipped += 1;
      return;
    }
    if (resolved.status !== 'known') {
      malformed += 1;
      log.warn('Skipped malformed recommendation favorite.', {
        favoritePath: record.ref.path,
        reason: resolved.reason,
      });
      return;
    }
    candidates.push({ ...record, target: resolved.target });
  });

  const uniqueSourcePaths = Array.from(new Set(candidates.map(({ target }) => target.path)));
  const sourceSnapshots = uniqueSourcePaths.length
    ? await firestore.getAll(...uniqueSourcePaths.map((path) => firestore.doc(path)))
    : [];
  const sources = new Map(sourceSnapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
  const available = [];
  let missing = 0;

  candidates.forEach((candidate) => {
    const snapshot = sources.get(candidate.target.path);
    if (!snapshot?.exists) {
      missing += 1;
      log.warn('Recommendation source is missing; favorite was left unchanged.', {
        favoritePath: candidate.ref.path,
        sourcePath: candidate.target.path,
      });
      return;
    }
    available.push({ ...candidate, sourceData: snapshot.data() || {} });
  });

  const ownerIds = Array.from(new Set(
    available.map(({ sourceData }) => sourceData.ownerId).filter(Boolean)
  ));
  const profileSnapshots = ownerIds.length
    ? await firestore.getAll(...ownerIds.map((id) => firestore.doc(`publicProfiles/${id}`)))
    : [];
  const profiles = new Map(profileSnapshots.map((snapshot) => [
    snapshot.ref.path.split('/').pop(),
    snapshot.exists ? snapshot.data() : null,
  ]));

  const updates = available.flatMap(({ ref, data, target, sourceData }) => {
    const preview = buildFavoritePreview({
      target,
      data: sourceData,
      publicProfile: profiles.get(sourceData.ownerId) || null,
    });
    if (isDeepStrictEqual(data?.preview, preview)) return [];
    return [{
      ref,
      preview,
      sourceUpdatedAt: sourceData.updatedAt || sourceData.createdAt || serverTimestamp(),
    }];
  });
  const updated = apply ? await updateFavoriteRefs(firestore, updates) : 0;

  return {
    scanned: records.length,
    candidates: candidates.length,
    ready: updates.length,
    skipped,
    malformed,
    missing,
    updated,
  };
}

function addSummary(target, source) {
  Object.keys(target).forEach((key) => {
    target[key] += source[key] || 0;
  });
}

async function backfillFavoritePreviews({
  firestore,
  apply = false,
  limit = Number.POSITIVE_INFINITY,
  log = console,
}) {
  const summary = {
    scanned: 0,
    candidates: 0,
    ready: 0,
    skipped: 0,
    malformed: 0,
    missing: 0,
    updated: 0,
  };
  let lastUser = null;
  let pending = [];

  const flush = async () => {
    if (!pending.length) return;
    const result = await inspectRecommendationFavorites({
      firestore,
      records: pending,
      apply,
      log,
    });
    addSummary(summary, result);
    pending = [];
  };

  while (summary.scanned + pending.length < limit) {
    let query = firestore
      .collection('users')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(USER_PAGE_SIZE);
    if (lastUser) query = query.startAfter(lastUser);
    const users = await query.get();
    if (users.empty) break;

    for (const user of users.docs) {
      const favorites = await user.ref.collection('favorites').get();
      for (const favorite of favorites.docs) {
        if (summary.scanned + pending.length >= limit) break;
        pending.push({ ref: favorite.ref, data: favorite.data() || {} });
        if (pending.length >= READ_BATCH_SIZE) await flush();
      }
      if (summary.scanned + pending.length >= limit) break;
    }
    lastUser = users.docs[users.docs.length - 1];
  }

  await flush();
  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin);
  console.log(`Favorite preview backfill: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  const summary = await backfillFavoritePreviews({
    firestore: admin.firestore(),
    ...options,
  });
  console.log('Favorite preview backfill complete.', summary);
  if (!options.apply && summary.ready > 0) {
    console.log('No data changed. Re-run with --apply after reviewing this summary.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Favorite preview backfill failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  backfillFavoritePreviews,
  inspectRecommendationFavorites,
  parseArgs,
  resolveRecommendationTarget,
};
