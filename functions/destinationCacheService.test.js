const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEDULED_CACHE_REFRESH_LIMITS,
  cachedProviderLoad,
  hasUsableDestinationCache,
  millis,
  refreshDestinationCaches,
  scheduledCacheRequestContext,
} = require('./destinationCacheService');

test('scheduled refresh reserves most of the zero-cost daily quota for interactive users', () => {
  const records = SCHEDULED_CACHE_REFRESH_LIMITS.destinations
    + SCHEDULED_CACHE_REFRESH_LIMITS.exactPlaces;
  assert.equal(records * 2, SCHEDULED_CACHE_REFRESH_LIMITS.maximumDetailsRequests);
  assert.ok(SCHEDULED_CACHE_REFRESH_LIMITS.maximumDetailsRequests < 30);
  assert.ok(SCHEDULED_CACHE_REFRESH_LIMITS.maximumDetailsRequests < 150);
  assert.deepEqual(scheduledCacheRequestContext(), {
    count: 0,
    maximum: SCHEDULED_CACHE_REFRESH_LIMITS.maximumDetailsRequests,
  });
});

test('scheduled refresh request context is a hard provider-attempt ceiling, including retries', async () => {
  let providerCalls = 0;
  let update = null;
  const document = {
    data: () => ({
      countryId: 'IL',
      status: 'active',
      providerRefs: { googlePlaceId: 'place-1' },
      googleCache: { names: { he: 'חיפה', en: 'Haifa' } },
    }),
    ref: {
      path: 'countries/IL/destinations/haifa',
      update: async (value) => { update = value; },
    },
  };
  const query = {
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    get: async () => ({ docs: [document] }),
  };
  const firestore = () => ({ collectionGroup: () => query });
  firestore.FieldValue = { serverTimestamp: () => 'NOW' };
  const requestContext = { count: 0, maximum: 1 };

  const result = await refreshDestinationCaches({
    admin: { firestore },
    projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'oauth-token',
    requestContext,
    fetchImpl: async () => {
      providerCalls += 1;
      return { ok: false, status: 500, json: async () => ({}) };
    },
    now: new Date('2026-08-30T00:00:00Z'),
  });

  assert.equal(providerCalls, 1);
  assert.equal(requestContext.count, 1);
  assert.equal(result[0].state, 'retry');
  assert.ok(update['googleCache.refreshAfter'] instanceof Date);
});

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
    projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'oauth-token',
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

test('destination refresh preserves an admin Hebrew name', async () => {
  let update = null;
  const destination = {
    countryId: 'VN',
    status: 'active',
    providerRefs: { googlePlaceId: 'sa-pa-city' },
    googleCache: {
      names: { he: 'סאפה', en: 'Sa Pa' },
      nameSources: { he: 'admin', en: 'google' },
    },
  };
  const document = {
    data: () => destination,
    ref: { path: 'countries/VN/destinations/sa-pa', update: async (value) => { update = value; } },
  };
  const query = {
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    get: async () => ({ docs: [document] }),
  };
  const firestore = () => ({ collectionGroup: () => query });
  firestore.FieldValue = { serverTimestamp: () => 'NOW' };
  const admin = { firestore };
  const details = (language) => ({
    id: 'sa-pa-city',
    displayName: { text: language === 'he' ? 'סה פה' : 'Sa Pa' },
    addressComponents: [
      { longText: language === 'he' ? 'סה פה' : 'Sa Pa', types: ['locality'] },
      { longText: language === 'he' ? 'וייטנאם' : 'Vietnam', shortText: 'VN', types: ['country'] },
    ],
    location: { latitude: 22.3364, longitude: 103.8438 },
    types: ['locality'],
  });

  await refreshDestinationCaches({
    admin,
    projectId: 'planli-f0b12',
    accessTokenProvider: async () => 'oauth-token',
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () => details(new URL(url).searchParams.get('languageCode')),
    }),
    now: new Date('2026-08-20T00:00:00Z'),
  });

  assert.equal(update.googleCache.names.he, 'סאפה');
  assert.equal(update.googleCache.nameSources.he, 'admin');
});
