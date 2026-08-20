const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cachedProviderLoad,
  hasUsableDestinationCache,
  millis,
  refreshDestinationCaches,
} = require('./destinationCacheService');

test('v3 destinations require complete bilingual Google data before expiry', () => {
  const now = Date.parse('2026-08-12T00:00:00Z');
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: {
      names: { he: 'פריז', en: 'Paris' },
      expiresAt: new Date(now + 1),
    },
  }, now), true);
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: { names: { he: 'פריז' }, expiresAt: new Date(now + 1) },
  }, now), false);
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: {
      names: { he: 'פריז', en: 'Paris' },
      expiresAt: new Date(now),
    },
  }, now), false);
  assert.equal(hasUsableDestinationCache({
    schemaVersion: 3,
    googleCache: {
      names: { he: 'Vlore', en: 'Vlorë' },
      expiresAt: new Date(now + 1),
    },
  }, now), false);
});

test('cache timestamp conversion supports Firestore timestamps and dates', () => {
  assert.equal(millis({ toMillis: () => 123 }), 123);
  assert.equal(millis({ toDate: () => new Date(456) }), 456);
  assert.equal(millis(new Date(789)), 789);
});

test('one refresh run deduplicates provider work by Google Place ID', async () => {
  const cache = new Map();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { placeId: 'shared-place' };
  };

  const [first, second] = await Promise.all([
    cachedProviderLoad(cache, 'shared-place', loader),
    cachedProviderLoad(cache, 'shared-place', loader),
  ]);

  assert.equal(calls, 1);
  assert.equal(first, second);
});

test('destination refresh cannot restore a Latin value into the Hebrew name field', async () => {
  let update = null;
  const destination = {
    countryId: 'AL',
    status: 'active',
    providerRefs: { googlePlaceId: 'vlore-city' },
    googleCache: { names: { he: 'Vlorë', en: 'Vlorë' } },
  };
  const document = {
    data: () => destination,
    ref: { path: 'countries/AL/destinations/vlore', update: async (value) => { update = value; } },
  };
  const query = {
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    get: async () => ({ docs: [document] }),
  };
  const firestore = () => ({ collectionGroup: () => query });
  firestore.FieldValue = { serverTimestamp: () => 'NOW' };
  const admin = { firestore };
  const details = (language) => ({
    id: 'vlore-city',
    displayName: { text: 'Vlorë' },
    addressComponents: [
      { longText: 'Vlorë', types: ['locality'] },
      { longText: language === 'he' ? 'אלבניה' : 'Albania', shortText: 'AL', types: ['country'] },
    ],
    location: { latitude: 40.466, longitude: 19.489 },
    viewport: {
      low: { latitude: 40.38, longitude: 19.4 },
      high: { latitude: 40.55, longitude: 19.6 },
    },
    types: ['locality'],
  });

  const result = await refreshDestinationCaches({
    admin,
    newPlacesKey: 'new-key',
    placesProvider: 'new',
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () => details(new URL(url).searchParams.get('languageCode')),
    }),
    now: new Date('2026-08-20T00:00:00Z'),
  });

  assert.equal(result[0].state, 'ready');
  assert.equal(update.googleCache.names.he, 'ולורה');
  assert.equal(update.googleCache.nameSources.he, 'override');
});
