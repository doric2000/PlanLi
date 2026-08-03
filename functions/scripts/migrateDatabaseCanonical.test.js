const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const {
  canonicalAsset,
  compact,
  legacyDestinationKey,
  mappedCity,
  parseArgs,
  safeId,
  stableId,
} = require('./migrateDatabaseCanonical');

test('database migration is dry-run unless apply is explicit', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--apply', '--resume']).resume, true);
  assert.equal(parseArgs(['--apply', '--cleanup-only']).cleanupOnly, true);
});

test('legacy destination lookup tolerates accidental surrounding whitespace', () => {
  const cityMap = new Map([
    [legacyDestinationKey('יוון', 'מיקונוס '), { countryId: 'cty_gr', cityId: 'city_mykonos' }],
  ]);
  assert.deepEqual(mappedCity(cityMap, 'יוון', 'מיקונוס'), {
    countryId: 'cty_gr',
    cityId: 'city_mykonos',
  });
});

test('stable destination IDs are deterministic and separated by type', () => {
  assert.equal(stableId('cty', 'IL'), stableId('cty', 'IL'));
  assert.notEqual(stableId('cty', 'IL'), stableId('city', 'IL'));
  assert.match(stableId('cty', 'IL'), /^cty_[A-Za-z0-9_-]{20}$/);
});

test('document IDs reject path separators and media requires all variants', () => {
  assert.equal(safeId('stop-1', 'fallback'), 'stop-1');
  assert.equal(safeId('bad/id', 'fallback'), 'fallback');
  assert.equal(canonicalAsset({ assetId: 'a', large: {}, feed: {}, thumb: {} }), null);
  const asset = {
    assetId: 'a',
    large: { url: 'large' },
    feed: { url: 'feed' },
    thumb: { url: 'thumb' },
  };
  assert.equal(canonicalAsset(asset), asset);
});

test('compact preserves Firestore atomic values instead of flattening them', () => {
  const timestamp = new admin.firestore.Timestamp(123, 456);
  const geopoint = new admin.firestore.GeoPoint(32.1, 34.8);
  const date = new Date('2026-01-01T00:00:00.000Z');
  const compacted = compact({ timestamp, geopoint, date, nested: { keep: true, drop: undefined } });

  assert.equal(compacted.timestamp, timestamp);
  assert.equal(compacted.geopoint, geopoint);
  assert.equal(compacted.date, date);
  assert.deepEqual(compacted.nested, { keep: true });
});
