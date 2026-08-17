/* eslint-disable no-console */
const admin = require('firebase-admin');
const { setMediaAvailability } = require('../mediaModeration');
const { collectCanonicalMediaAssets } = require('../mediaProcessor');
const { initializeAdmin } = require('./localCredentials');

const COLLECTIONS = new Set(['recommendations', 'routes', 'trips', 'users']);
const DEFAULT_BUCKET = 'planli-f0b12-media-eu';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const collection = valueAfter(argv, '--collection') || '';
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  if (!COLLECTIONS.has(collection)) {
    throw new Error('--collection must be recommendations, routes, trips, or users.');
  }
  return {
    apply: argv.includes('--apply'),
    after: valueAfter(argv, '--after'),
    bucket: valueAfter(argv, '--bucket') || DEFAULT_BUCKET,
    collection,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 100,
  };
}

async function runBackfill({ apply, after, bucket, collection, limit }) {
  const db = admin.firestore();
  let query = db.collection(collection)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(limit);
  if (after) query = query.startAfter(after);
  const snapshot = await query.get();
  let assets = 0;
  let unavailable = 0;
  for (const entry of snapshot.docs) {
    const data = entry.data() || {};
    const mediaAssets = collectCanonicalMediaAssets(data);
    if (!mediaAssets.length) continue;
    const available = collection === 'users'
      ? data.moderation?.status === 'active'
      : data.status === 'active';
    assets += mediaAssets.length;
    if (!available) unavailable += mediaAssets.length;
    if (apply) {
      await setMediaAvailability({
        admin,
        data,
        mediaBucket: bucket,
        available,
        reason: available ? null : (data.status || data.moderation?.status || 'unavailable'),
      });
    }
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    collection,
    inspected: snapshot.size,
    assets,
    unavailable,
    nextAfter: snapshot.size === limit ? snapshot.docs.at(-1).id : null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin, { storageBucket: options.bucket });
  console.log(JSON.stringify(await runBackfill(options), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, runBackfill };
