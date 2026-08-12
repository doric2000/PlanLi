const test = require('node:test');
const assert = require('node:assert/strict');

const {
  catalogData,
  filterCatalogByActiveCountries,
  getCatalogSnapshot,
} = require('./destinationCatalogService');

test('catalog entries are public only when both destination and country are active', () => {
  const base = {
    countryId: 'FR',
    cityId: 'PAR',
    city: { status: 'active', name: 'Paris', stats: { recommendationCount: 2 } },
    country: { status: 'active', name: 'France' },
    timestamp: 'NOW',
  };
  assert.equal(catalogData(base).status, 'active');
  assert.equal(catalogData({
    ...base,
    country: { ...base.country, status: 'inactive' },
  }).status, 'inactive');
});

test('a missing or building catalog index returns a retryable public error', async () => {
  await assert.rejects(
    getCatalogSnapshot({ get: async () => { throw Object.assign(new Error('missing index'), { code: 9 }); } }),
    (error) => error.code === 'unavailable' && /try again shortly/i.test(error.message)
  );
});

test('catalog page filtering removes entries whose parent country is inactive', () => {
  const documents = [
    { data: () => ({ countryId: 'FR', cityId: 'PAR', cacheExpiresAt: new Date('2099-01-01') }) },
    { data: () => ({ countryId: 'ZZ', cityId: 'HIDDEN', cacheExpiresAt: new Date('2099-01-01') }) },
  ];
  const filtered = filterCatalogByActiveCountries(documents, new Set(['FR']));
  assert.deepEqual(filtered.map((entry) => entry.data().cityId), ['PAR']);
});
