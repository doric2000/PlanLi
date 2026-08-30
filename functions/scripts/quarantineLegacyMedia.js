/* eslint-disable no-console */
const admin = require('firebase-admin');
const { setFileAvailability } = require('../mediaModeration');
const { initializeAdmin } = require('./localCredentials');
const { ACTIVE_MEDIA_BUCKET, assertActiveMediaBucket } = require('./storageTargetPolicy');

const DEFAULT_BUCKET = ACTIVE_MEDIA_BUCKET;
const LEGACY_PREFIXES = new Set([
  'optimized',
  'profilePicture',
  'recommendations',
  'routes',
  'trips',
]);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  const prefix = valueAfter(argv, '--prefix') || '';
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  if (!LEGACY_PREFIXES.has(prefix)) {
    throw new Error('--prefix must be optimized, profilePicture, recommendations, routes, or trips.');
  }
  return {
    all: argv.includes('--all'),
    apply: argv.includes('--apply'),
    bucket: assertActiveMediaBucket(valueAfter(argv, '--bucket') || DEFAULT_BUCKET),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 100,
    pageToken: valueAfter(argv, '--page-token'),
    prefix,
  };
}

async function runQuarantine({ all, apply, bucket: bucketName, limit, pageToken, prefix }) {
  const bucket = admin.storage().bucket(bucketName);
  let currentPageToken = pageToken || undefined;
  let inspected = 0;
  let tokenized = 0;
  let pages = 0;
  do {
    const [files, nextQuery] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: limit,
      pageToken: currentPageToken,
      prefix: `${prefix}/`,
    });
    pages += 1;
    inspected += files.length;
    for (const file of files) {
      // Object listings already include custom metadata. Reusing it keeps the
      // dry-run compatible with a least-privilege inventory-only credential and
      // avoids one extra Storage request per legacy object.
      const metadata = file.metadata || {};
      if (metadata.metadata?.firebaseStorageDownloadTokens) tokenized += 1;
      if (apply) await setFileAvailability(file, false, metadata);
    }
    currentPageToken = nextQuery?.pageToken || null;
  } while (all && currentPageToken);
  return {
    mode: apply ? 'apply' : 'dry-run',
    bucket: bucketName,
    prefix,
    pages,
    inspected,
    tokenized,
    nextPageToken: currentPageToken,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin, { storageBucket: options.bucket });
  console.log(JSON.stringify(await runQuarantine(options), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { LEGACY_PREFIXES, parseArgs, runQuarantine };
