const test = require('node:test');
const assert = require('node:assert/strict');
const { geographicCandidate } = require('./buildWorldDestinationCatalog');

const entity = (patch = {}) => ({ id: 'Q1', en: 'Test city', he: 'עיר בדיקה',
  countries: new Set(['NO']), coordinates: new Set(['Point(5.32 60.39)']),
  types: new Set(['Q515']), links: 20, ...patch });

test('catalog source verification never creates Google approval or an active destination', () => {
  const result = geographicCandidate(entity());
  assert.equal(result.status, 'candidate');
  assert.equal(result.research.sourceVerified, true);
  assert.equal(result.research.providerVerified, false);
  assert.equal(result.providerRefs, undefined);
  assert.deepEqual(result.center, { lat: 60.39, lng: 5.32 });
});

test('research excludes languages, missing Hebrew, cross-country and ambiguous coordinates', () => {
  for (const patch of [ { types: new Set(['Q1288568']) }, { he: 'Q1' },
    { countries: new Set(['NO', 'SE']) }, { coordinates: new Set(['Point(5 60)', 'Point(9 60)']) },
    { types: new Set(['Q515', 'Q839954']) },
    { coordinates: new Set(['Point(- 60)']) }, { coordinates: new Set(['Point(5 ..)']) } ]) {
    assert.equal(geographicCandidate(entity(patch)), null);
  }
});
