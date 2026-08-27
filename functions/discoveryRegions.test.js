const test = require('node:test');
const assert = require('node:assert/strict');
const { countries } = require('countries-list');
const {
  DISCOVERY_REGION_IDS, discoveryRegionForCountry, routeRegionFields,
} = require('./discoveryRegions');

test('all installed countries map to exactly one supported discovery region', () => {
  const mapped = Object.keys(countries).map((code) => discoveryRegionForCountry(code));
  assert.equal(mapped.length, 252);
  assert.equal(mapped.filter((id) => DISCOVERY_REGION_IDS.includes(id)).length, 252);
});

test('geopolitical and taxonomy edges remain explicit', () => {
  assert.equal(discoveryRegionForCountry('IL'), 'israel');
  assert.equal(discoveryRegionForCountry('PS'), 'south_central_asia');
  assert.equal(discoveryRegionForCountry('RU'), 'europe');
  assert.equal(discoveryRegionForCountry('TL'), 'east_southeast_asia');
});

test('multi-region routes get ordered ids and queryable membership', () => {
  assert.deepEqual(routeRegionFields(['IL', 'FR', 'IL']), {
    discoveryRegionIds: ['israel', 'europe'],
    discoveryRegionMembership: { israel: true, europe: true },
  });
});
