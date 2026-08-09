/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');
const { isDeepStrictEqual } = require('node:util');

const { buildMapLocation } = require('../mapLocation');
const { initializeAdmin } = require('./localCredentials');

const PAGE_SIZE = 400;

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

function inspectRecommendation(document) {
  const data = document.data() || {};
  const nextMapLocation = buildMapLocation(data?.place?.coordinates);
  if (!nextMapLocation) {
    return {
      status: 'missing-coordinates',
      path: document.ref.path,
    };
  }
  if (isDeepStrictEqual(data.mapLocation, nextMapLocation)) {
    return { status: 'current', path: document.ref.path };
  }
  return {
    status: 'ready',
    path: document.ref.path,
    ref: document.ref,
    mapLocation: nextMapLocation,
  };
}

async function commitUpdates(firestore, updates) {
  if (!updates.length) return 0;
  const batch = firestore.batch();
  updates.forEach((entry) => batch.update(entry.ref, { mapLocation: entry.mapLocation }));
  await batch.commit();
  return updates.length;
}

async function backfillRecommendationMapLocations({
  firestore,
  apply = false,
  limit = Number.POSITIVE_INFINITY,
  log = console,
}) {
  const summary = {
    scanned: 0,
    ready: 0,
    current: 0,
    missingCoordinates: 0,
    updated: 0,
  };
  let lastDocument = null;

  while (summary.scanned < limit) {
    const remaining = Math.min(PAGE_SIZE, limit - summary.scanned);
    let query = firestore
      .collection('recommendations')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(remaining);
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const updates = [];
    snapshot.docs.forEach((document) => {
      const result = inspectRecommendation(document);
      summary.scanned += 1;
      if (result.status === 'ready') {
        summary.ready += 1;
        updates.push(result);
      } else if (result.status === 'current') {
        summary.current += 1;
      } else {
        summary.missingCoordinates += 1;
        log.warn('Recommendation has no valid place coordinates; left unchanged.', {
          path: result.path,
        });
      }
    });
    if (apply) summary.updated += await commitUpdates(firestore, updates);
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < remaining) break;
  }

  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin);
  console.log(`Recommendation map-location backfill: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  const summary = await backfillRecommendationMapLocations({
    firestore: admin.firestore(),
    ...options,
  });
  console.log('Recommendation map-location backfill complete.', summary);
  if (!options.apply && summary.ready > 0) {
    console.log('No data changed. Re-run with --apply after reviewing this summary.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Recommendation map-location backfill failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  backfillRecommendationMapLocations,
  inspectRecommendation,
  parseArgs,
};
