const test = require('node:test');
const assert = require('node:assert/strict');
const { regionPatchForDocument } = require('./backfillDiscoveryRegions');

test('derives canonical recommendation and route region fields', () => {
  assert.deepEqual(regionPatchForDocument('recommendation', { destination: { countryId: 'IL' } }, 'r1'), { discoveryRegionId: 'israel' });
  assert.deepEqual(regionPatchForDocument('route', { destinations: [{ countryId: 'US' }, { countryId: 'MX' }] }, 'x1'), {
    discoveryRegionIds: ['north_america', 'latin_america'],
    discoveryRegionMembership: { north_america: true, latin_america: true },
  });
});

test('rejects documents without a supported canonical country', () => {
  assert.throws(() => regionPatchForDocument('catalog', { countryId: 'ZZ' }, 'bad'));
});
