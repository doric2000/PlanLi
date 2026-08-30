const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MAPS_OAUTH_SCOPES,
  billingProjectId,
} = require('./googleMapsOAuth');

test('Maps OAuth requests only the Places and Geocoding scopes', () => {
  assert.deepEqual(MAPS_OAUTH_SCOPES, [
    'https://www.googleapis.com/auth/maps-platform.places',
    'https://www.googleapis.com/auth/maps-platform.geocode',
  ]);
  assert.equal(MAPS_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/cloud-platform'), false);
});

test('quota billing project is explicit and rejects malformed values', () => {
  assert.equal(billingProjectId('planli-f0b12'), 'planli-f0b12');
  assert.throws(() => billingProjectId('not a project'), /billing project/);
});

test('daily destination cache refresh is not exported for deployment', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.doesNotMatch(source, /exports\.refreshDestinationCachesScheduled\s*=/u);
  assert.doesNotMatch(source, /refreshDestinationCaches|refreshExactPlaceCaches/u);
});
