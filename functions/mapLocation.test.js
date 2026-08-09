const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMapLocation, normalizeMapCoordinates } = require('./mapLocation');

test('map locations normalize coordinates and create stable geohashes', () => {
  const location = buildMapLocation({ lat: '32.0853', lng: 34.7818 });
  assert.deepEqual(location, {
    geohash: buildMapLocation({ latitude: 32.0853, longitude: 34.7818 }).geohash,
    lat: 32.0853,
    lng: 34.7818,
  });
  assert.ok(location.geohash.length >= 9);
});

test('invalid map coordinates are rejected', () => {
  assert.equal(normalizeMapCoordinates(null), null);
  assert.equal(buildMapLocation({ lat: 91, lng: 0 }), null);
  assert.equal(buildMapLocation({ lat: 0, lng: 181 }), null);
});
