const test = require('node:test');
const assert = require('node:assert/strict');

const {
  catalogData,
  compactDestinationSearchText,
  destinationSearchForms,
  filterCatalogByActiveCountries,
  getCatalogSnapshot,
  searchDestinations,
  syncDestinationCatalog,
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

test('catalog search forms tolerate punctuation, spacing, diacritics, and Hebrew variants', () => {
  assert.equal(compactDestinationSearchText('  St. John’s '), 'stjohns');
  assert.deepEqual(destinationSearchForms("St. John's").sort(), ['john', 'johns', 's', 'st', 'stjohns'].sort());
  assert.equal(compactDestinationSearchText('São Paulo'), 'saopaulo');
  assert.equal(compactDestinationSearchText('יְרוּשָׁלַיִם'), 'ירושלימ');
});

test('catalog data stores bounded prefixes for full names and punctuation-separated words', () => {
  const data = catalogData({
    countryId: 'CA',
    cityId: 'st-johns',
    city: {
      status: 'active',
      googleCache: { names: { en: 'St. John’s', he: 'סנט ג׳ונס' } },
    },
    country: { status: 'active', names: { en: 'Canada', he: 'קנדה' } },
    timestamp: 'NOW',
  });
  assert.ok(data.search.prefixes.includes('stjohns'));
  assert.ok(data.search.prefixes.includes('johns'));
  assert.ok(data.search.prefixes.length <= 160);
});

test('destination search uses one indexed query with a compact bounded prefix', async () => {
  const whereCalls = [];
  const firestoreQuery = {
    where(...args) { whereCalls.push(args); return this; },
    orderBy() { return this; },
    limit() { return this; },
    async get() { return { empty: true, docs: [], size: 0 }; },
  };
  const firestore = () => ({ collection: () => firestoreQuery });
  const result = await searchDestinations({ admin: { firestore }, data: { query: 'St. John’s', limit: 10 } });
  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.deepEqual(whereCalls.filter((args) => args[0] === 'search.prefixes'), [
    ['search.prefixes', 'array-contains', 'stjohns'],
  ]);
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

test('catalog synchronization replaces its owned document instead of merging stale image source fields', async () => {
  let writeOptions = 'not-called';
  const destinationImage = { source: { type: 'unsplash', providerPhotoId: 'photo-1' } };
  const ref = { set: async (_data, options) => { writeOptions = options; } };
  const admin = {
    firestore: () => ({
      doc: (path) => path === 'countries/FR'
        ? { get: async () => ({ data: () => ({ status: 'active', names: { en: 'France' } }) }) }
        : ref,
    }),
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'NOW' };
  await syncDestinationCatalog({
    admin,
    countryId: 'FR',
    cityId: 'PAR',
    city: {
      status: 'active',
      googleCache: { names: { en: 'Paris' }, expiresAt: new Date('2099-01-01') },
      destinationImage,
    },
  });
  assert.equal(writeOptions, undefined);
});
