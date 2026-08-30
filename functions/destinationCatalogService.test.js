const test = require('node:test');
const assert = require('node:assert/strict');

const {
  catalogData,
  compactDestinationSearchText,
  destinationClassFor,
  destinationSearchForms,
  filterCatalogByActiveCountries,
  getCatalogSnapshot,
  searchDestinations,
  syncDestinationCatalog,
} = require('./destinationCatalogService');

const approvedPolicy = (countryId, registryId = `${countryId.toLowerCase()}-destination`) => ({
  approved: true,
  registryId,
  kind: 'city_hub',
  groupingPolicy: 'self',
  registryVersion: 3,
  approvalRevision: 1,
  registryAttestation: {
    approved: true, registryId, registryVersion: 3,
    approvalRevision: 1, countryId,
  },
});

test('catalog entries are public only when both destination and country are active', () => {
  const base = {
    countryId: 'FR',
    cityId: 'PAR',
    city: {
      status: 'active', name: 'Paris', stats: { recommendationCount: 2 }, canonicalPolicy: approvedPolicy('FR'),
    },
    country: { status: 'active', name: 'France' },
    timestamp: 'NOW',
  };
  assert.equal(catalogData(base).status, 'active');
  assert.equal(catalogData({
    ...base,
    country: { ...base.country, status: 'inactive' },
  }).status, 'inactive');
  assert.equal(catalogData({
    ...base,
    city: { ...base.city, canonicalPolicy: { ...approvedPolicy('FR'), approved: false } },
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
      canonicalPolicy: approvedPolicy('CA'),
      googleCache: { names: { en: 'St. John’s', he: 'סנט ג׳ונס' } },
    },
    country: { status: 'active', names: { en: 'Canada', he: 'קנדה' } },
    timestamp: 'NOW',
  });
  assert.ok(data.search.prefixes.includes('stjohns'));
  assert.ok(data.search.prefixes.includes('johns'));
  assert.ok(data.search.prefixes.length <= 160);
});

test('catalog projects destination class and geometry for containment queries', () => {
  const data = catalogData({
    countryId: 'AL',
    cityId: 'vlore',
    city: {
      status: 'active',
      destinationType: 'city',
      googleCache: {
        names: { he: 'ולורה', en: 'Vlorë' },
        coordinates: { lat: 40.466, lng: 19.489 },
        viewport: {
          southwest: { lat: 40.38, lng: 19.4 },
          northeast: { lat: 40.55, lng: 19.6 },
        },
        types: ['locality', 'political'],
      },
    },
    country: { status: 'active', names: { he: 'אלבניה', en: 'Albania' } },
    timestamp: 'NOW',
  });
  assert.equal(data.destinationClass, 'settlement');
  assert.equal(data.destinationType, 'city');
  assert.deepEqual(data.coordinates, { lat: 40.466, lng: 19.489 });
  assert.deepEqual(data.viewport.southwest, { lat: 40.38, lng: 19.4 });
  assert.deepEqual(data.googleTypes, ['locality', 'political']);
  assert.equal(destinationClassFor({ destinationType: 'region' }), 'administrative');
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

test('destination search rejects a cursor that changes the Firestore document path', async () => {
  const firestoreQuery = {
    where() { return this; },
    orderBy() { return this; },
  };
  const firestore = () => ({ collection: () => firestoreQuery });

  await assert.rejects(
    searchDestinations({ admin: { firestore }, data: { cursor: 'country/city' } }),
    (error) => error.code === 'invalid-argument'
  );
  await assert.rejects(
    searchDestinations({ admin: { firestore }, data: { cursor: 'destination-id\n' } }),
    (error) => error.code === 'invalid-argument'
  );
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
      canonicalPolicy: approvedPolicy('FR'),
      googleCache: { names: { en: 'Paris' }, expiresAt: new Date('2099-01-01') },
      destinationImage,
    },
  });
  assert.equal(writeOptions, undefined);
});
