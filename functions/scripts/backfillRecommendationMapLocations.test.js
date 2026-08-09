const test = require('node:test');
const assert = require('node:assert/strict');

const {
  backfillRecommendationMapLocations,
  inspectRecommendation,
  parseArgs,
} = require('./backfillRecommendationMapLocations');

function document(id, data) {
  return {
    id,
    ref: { path: `recommendations/${id}` },
    data: () => data,
  };
}

test('map-location backfill is dry-run unless apply is explicit', () => {
  assert.deepEqual(parseArgs([]), { apply: false, limit: Number.POSITIVE_INFINITY });
  assert.deepEqual(parseArgs(['--apply', '--limit', '20']), { apply: true, limit: 20 });
});

test('recommendation inspection reports ready, current and missing coordinates', () => {
  const ready = inspectRecommendation(document('ready', {
    place: { coordinates: { lat: 32.08, lng: 34.78 } },
  }));
  assert.equal(ready.status, 'ready');
  assert.ok(ready.mapLocation.geohash);
  assert.equal(inspectRecommendation(document('current', {
    place: { coordinates: { lat: 32.08, lng: 34.78 } },
    mapLocation: ready.mapLocation,
  })).status, 'current');
  assert.equal(inspectRecommendation(document('missing', { place: {} })).status, 'missing-coordinates');
});

test('map-location backfill writes in batches only in apply mode', async () => {
  const docs = [
    document('one', { place: { coordinates: { lat: 32.08, lng: 34.78 } } }),
    document('missing', { place: {} }),
  ];
  const writes = [];
  const query = {
    orderBy: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => ({ docs, empty: false }),
  };
  const firestore = {
    collection: () => query,
    batch: () => ({
      update: (ref, data) => writes.push({ ref, data }),
      commit: async () => {},
    }),
  };
  const log = { warn: () => {} };
  const dryRun = await backfillRecommendationMapLocations({ firestore, limit: 2, log });
  assert.equal(dryRun.ready, 1);
  assert.equal(dryRun.missingCoordinates, 1);
  assert.equal(dryRun.updated, 0);
  assert.equal(writes.length, 0);

  const applied = await backfillRecommendationMapLocations({ firestore, apply: true, limit: 2, log });
  assert.equal(applied.updated, 1);
  assert.equal(writes.length, 1);
});
