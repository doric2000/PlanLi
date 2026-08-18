/* eslint-disable no-console, no-await-in-loop */
const crypto = require('crypto');
const admin = require('firebase-admin');

const { deleteContentInternal } = require('../deletionService');
const { collectManagedMediaPaths } = require('../mediaCleanup');
const { initializeAdmin } = require('./localCredentials');

const CONFIRMATION = 'DELETE_ALL_RECOMMENDATIONS';
const DEFAULT_MEDIA_BUCKET = 'planli-f0b12-media-eu';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    confirmation: valueAfter(argv, '--confirm'),
    expectedFingerprint: valueAfter(argv, '--fingerprint'),
    mediaBucket: valueAfter(argv, '--media-bucket') || DEFAULT_MEDIA_BUCKET,
  };
}

function legacyRecommendationObject(value, recommendationId) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== 'firebasestorage.googleapis.com') return null;
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    const bucket = decodeURIComponent(match[1]);
    const objectPath = decodeURIComponent(match[2]);
    if (!objectPath.startsWith(`recommendations/${recommendationId}/`)) return null;
    return { bucket, objectPath };
  } catch {
    return null;
  }
}

function collectLegacyRecommendationObjects(data, recommendationId) {
  const values = Array.isArray(data?.images) ? data.images : [];
  return values
    .map((value) => legacyRecommendationObject(value, recommendationId))
    .filter(Boolean);
}

function fingerprintEntries(entries) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(entries.map(({ id, updateTime }) => ({ id, updateTime }))))
    .digest('hex');
}

async function buildManifest(db) {
  const snapshot = await db.collection('recommendations')
    .orderBy(admin.firestore.FieldPath.documentId())
    .get();
  const entries = snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      id: document.id,
      updateTime: document.updateTime?.toDate?.().toISOString() || null,
      managedMediaPaths: [...collectManagedMediaPaths(data)].sort(),
      legacyObjects: collectLegacyRecommendationObjects(data, document.id),
    };
  });
  return {
    count: entries.length,
    entries,
    fingerprint: fingerprintEntries(entries),
  };
}

async function deleteLegacyObjects(adminApi, entries) {
  for (const entry of entries) {
    for (const object of entry.legacyObjects) {
      await adminApi.storage().bucket(object.bucket).file(object.objectPath)
        .delete({ ignoreNotFound: true });
    }
  }
}

async function run({ adminApi = admin, options }) {
  const db = adminApi.firestore();
  const manifest = await buildManifest(db);
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    count: manifest.count,
    ids: manifest.entries.map((entry) => entry.id),
    managedMediaObjects: manifest.entries.reduce(
      (total, entry) => total + entry.managedMediaPaths.length,
      0
    ),
    legacyObjects: manifest.entries.flatMap((entry) => entry.legacyObjects),
    fingerprint: manifest.fingerprint,
  };
  if (!options.apply) return summary;
  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${CONFIRMATION}.`);
  }
  if (!options.expectedFingerprint || options.expectedFingerprint !== manifest.fingerprint) {
    throw new Error('Apply fingerprint does not match the current recommendation snapshot. Run dry-run again.');
  }

  await deleteLegacyObjects(adminApi, manifest.entries);
  for (const entry of manifest.entries) {
    await deleteContentInternal({
      admin: adminApi,
      target: { type: 'recommendation', id: entry.id },
      actorUid: 'prelaunch-maintenance',
      isAdmin: true,
      mediaBucket: options.mediaBucket,
    });
  }
  const remaining = await db.collection('recommendations').limit(1).get();
  if (!remaining.empty) throw new Error('Recommendation deletion did not finish; rerun dry-run before retrying.');
  return { ...summary, deleted: manifest.count, remaining: 0 };
}

async function main() {
  initializeAdmin(admin, { storageBucket: DEFAULT_MEDIA_BUCKET });
  const result = await run({ options: parseArgs(process.argv.slice(2)) });
  console.log(JSON.stringify(result, null, 2));
  if (result.mode === 'dry-run') {
    console.log(`No data changed. Apply requires --apply --confirm ${CONFIRMATION} --fingerprint <value>.`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  collectLegacyRecommendationObjects,
  fingerprintEntries,
  legacyRecommendationObject,
  parseArgs,
  run,
};
