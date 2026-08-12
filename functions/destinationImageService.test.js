const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildUnsplashDestinationImage,
  auditUnvalidatedDestinationImages,
  destinationImageContext,
  destinationQuery,
  maximumDestinationDistanceKm,
  resolveAndPersistDestinationImage,
  resolveDestinationImageCandidate,
  searchUnsplash,
  selectMostPopularRecommendationImage,
  validateUnsplashPhoto,
} = require('./destinationImageService');

test('image query prefers cached English Google data without a further Google request', () => {
  assert.equal(destinationQuery({
    googleCache: { names: { he: 'פריז', en: 'Paris' }, countryCode: 'FR' },
  }, { code: 'FR', name: 'צרפת' }), 'Paris France');
});

function asset(id) {
  return {
    assetId: id,
    large: { url: `https://cdn.planli.test/${id}/large.jpg`, width: 1600, height: 900 },
    feed: { url: `https://cdn.planli.test/${id}/feed.jpg` },
    thumb: { url: `https://cdn.planli.test/${id}/thumb.jpg` },
    placeholder: { color: '#123456' },
  };
}

test('Unsplash selection preserves ixid and required attribution links', () => {
  const image = buildUnsplashDestinationImage({
    id: 'photo-1',
    width: 2400,
    height: 1600,
    color: '#abcdef',
    blur_hash: 'blur',
    urls: { raw: 'https://images.unsplash.com/photo-1?ixid=important' },
    links: { html: 'https://unsplash.com/photos/photo-1' },
    user: { name: 'Traveler', links: { html: 'https://unsplash.com/@traveler' } },
  }, 'Paris France');
  assert.equal(image.source.type, 'unsplash');
  assert.match(image.urls.large, /ixid=important/);
  assert.match(image.urls.large, /w=1600/);
  assert.match(image.attribution.photographerProfileUrl, /utm_source=planli/);
  assert.match(image.attribution.photoUrl, /utm_medium=referral/);
});

test('recommendation fallback skips inactive and missing media, then applies stable ranking', () => {
  const image = selectMostPopularRecommendationImage([
    { id: 'a', data: { status: 'active', stats: { likeCount: 100 }, createdAt: '2026-01-01' } },
    { id: 'b', data: { status: 'inactive', stats: { likeCount: 200 }, media: [asset('b')] } },
    { id: 'd', data: { status: 'active', stats: { likeCount: 10 }, createdAt: '2026-02-01', media: [asset('d')] } },
    { id: 'c', data: { status: 'active', stats: { likeCount: 10 }, createdAt: '2026-02-01', media: [asset('c')] } },
  ]);
  assert.equal(image.source.recommendationId, 'c');
  assert.equal(image.source.assetId, 'c');
});

test('Unsplash search uses the exact relevance and safety parameters', async () => {
  let requestedUrl;
  const result = await searchUnsplash({
    query: 'Paris France',
    accessKey: 'key',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        headers: { get: () => '49' },
        json: async () => ({ total: 0, results: [] }),
      };
    },
  });
  assert.equal(requestedUrl.searchParams.get('query'), 'Paris France');
  assert.equal(requestedUrl.searchParams.get('order_by'), 'relevant');
  assert.equal(requestedUrl.searchParams.get('orientation'), 'landscape');
  assert.equal(requestedUrl.searchParams.get('content_filter'), 'high');
  assert.equal(requestedUrl.searchParams.get('per_page'), '8');
  assert.deepEqual(result.photos, []);
  assert.equal(result.total, 0);
});

const arielCity = {
  destinationType: 'city',
  googleCache: {
    names: { he: 'אריאל', en: "Ari'el" },
    countryCode: 'IL',
    coordinates: { lat: 32.106, lng: 35.174 },
  },
};
const israel = { code: 'IL', names: { he: 'ישראל', en: 'Israel' } };

function locatedPhoto({
  id = 'photo', city = null, country = null, coordinates = null,
  description = null, alt = null, tags = [],
} = {}) {
  return {
    id,
    width: 2400,
    height: 1600,
    description,
    alt_description: alt,
    tags: tags.map((title) => ({ title })),
    location: {
      city,
      country,
      position: coordinates
        ? { latitude: coordinates.lat, longitude: coordinates.lng }
        : { latitude: null, longitude: null },
    },
    urls: { raw: `https://images.unsplash.com/${id}?ixid=search` },
    links: {
      html: `https://unsplash.com/photos/${id}`,
      download_location: `https://api.unsplash.com/photos/${id}/download`,
    },
    user: { name: 'Traveler', links: { html: 'https://unsplash.com/@traveler' } },
  };
}

test('Ariel rejects the Jerusalem Western Wall photo and accepts a nearby Ariel photo', () => {
  const context = destinationImageContext(arielCity, israel);
  const jerusalem = validateUnsplashPhoto(locatedPhoto({
    id: 'EaFcpzpQuYU',
    city: 'Jerusalem',
    country: 'Israel',
    coordinates: { lat: 31.7767, lng: 35.2345 },
    description: 'Western Wall, Old City, Jerusalem',
  }), context);
  assert.equal(jerusalem.valid, false);
  assert.equal(jerusalem.reason, 'outside_destination');

  const ariel = validateUnsplashPhoto(locatedPhoto({
    city: 'Ariel',
    country: 'Israel',
    coordinates: { lat: 32.105, lng: 35.18 },
  }), context);
  assert.equal(ariel.valid, true);
  assert.equal(ariel.validation.status, 'geo_verified');
  assert.equal(ariel.score, 3);
});

test("Ari'el punctuation normalizes to Ariel for text-only verification", () => {
  const result = validateUnsplashPhoto(locatedPhoto({
    city: 'Ariel',
    country: 'Israel',
    description: 'A view across Ariel, Israel',
  }), destinationImageContext(arielCity, israel));
  assert.equal(result.valid, true);
  assert.equal(result.validation.status, 'text_verified');
});

test('text-only verification requires the exact destination and country', () => {
  const context = destinationImageContext(arielCity, israel);
  assert.equal(validateUnsplashPhoto(locatedPhoto({
    description: 'Ariel Israel skyline',
  }), context).valid, true);
  assert.deepEqual(validateUnsplashPhoto(locatedPhoto({
    description: 'A beautiful view in Israel',
  }), context), { valid: false, reason: 'unverified_metadata' });
});

test('Paris France rejects a geotagged Paris Texas photo', () => {
  const city = {
    destinationType: 'city',
    googleCache: { names: { en: 'Paris' }, countryCode: 'FR', coordinates: { lat: 48.8566, lng: 2.3522 } },
  };
  const result = validateUnsplashPhoto(locatedPhoto({
    city: 'Paris',
    country: 'United States',
    coordinates: { lat: 33.6609, lng: -95.5555 },
  }), destinationImageContext(city, { code: 'FR', names: { en: 'France' } }));
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'conflicting_country');
});

test('a photo naming another city is rejected beyond five kilometres', () => {
  const result = validateUnsplashPhoto(locatedPhoto({
    city: 'Barkan',
    country: 'Israel',
    coordinates: { lat: 32.105, lng: 35.25 },
  }), destinationImageContext(arielCity, israel));
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'conflicting_city');
});

test('destination types and a cached viewport constrain validation radii', () => {
  assert.equal(maximumDestinationDistanceKm({ destinationType: 'village' }), 10);
  assert.equal(maximumDestinationDistanceKm({ destinationType: 'lake' }), 60);
  assert.equal(maximumDestinationDistanceKm({ destinationType: 'island' }), 60);
  assert.equal(maximumDestinationDistanceKm({ destinationType: 'region' }), 150);
  const radius = maximumDestinationDistanceKm({
    destinationType: 'city',
    coordinates: { lat: 32.106, lng: 35.174 },
    viewport: {
      northeast: { lat: 32.13, lng: 35.2 },
      southwest: { lat: 32.08, lng: 35.15 },
    },
  });
  assert.ok(radius > 2 && radius < 5);
});

function emptyRecommendationDb() {
  const query = {
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    startAfter() { return this; },
    async get() { return { docs: [], size: 0 }; },
  };
  return { collection: () => query };
}

test('explicit zero results and exhausted verification produce distinct outcomes', async () => {
  const zero = await resolveDestinationImageCandidate({
    db: emptyRecommendationDb(), city: arielCity, country: israel,
    countryId: 'IL', cityId: 'ARIEL', query: "Ari'el Israel", unsplashKey: 'key',
    fetchImpl: async () => ({ ok: true, headers: { get: () => null }, json: async () => ({ total: 0, results: [] }) }),
  });
  assert.equal(zero.outcome, 'zero_results');
  assert.equal(zero.image, null);

  let calls = 0;
  const summary = locatedPhoto({ id: 'wrong' });
  const noVerified = await resolveDestinationImageCandidate({
    db: emptyRecommendationDb(), city: arielCity, country: israel,
    countryId: 'IL', cityId: 'ARIEL', query: "Ari'el Israel", unsplashKey: 'key',
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, headers: { get: () => null }, json: async () => ({ total: 1, results: [{ id: 'wrong' }] }) }
        : { ok: true, json: async () => summary };
    },
  });
  assert.equal(noVerified.outcome, 'no_verified_match');
  assert.equal(calls, 2);
});

test('selection checks at most five details and stays within six requests before tracking', async () => {
  const summaries = Array.from({ length: 8 }, (_, index) => ({ id: `wrong-${index}` }));
  let requests = 0;
  const result = await resolveDestinationImageCandidate({
    db: emptyRecommendationDb(), city: arielCity, country: israel,
    countryId: 'IL', cityId: 'ARIEL', query: "Ari'el Israel", unsplashKey: 'key',
    onRequest: async () => { requests += 1; },
    fetchImpl: async (url) => String(url).includes('/search/photos')
      ? { ok: true, headers: { get: () => null }, json: async () => ({ total: 8, results: summaries }) }
      : { ok: true, json: async () => locatedPhoto({ id: String(url).split('/').pop() }) },
  });
  assert.equal(result.outcome, 'no_verified_match');
  assert.equal(requests, 6);
});

test('exact destination plus coordinates outranks an earlier coordinates-only result', async () => {
  const photos = [
    locatedPhoto({ id: 'generic-nearby', country: 'Israel', coordinates: { lat: 32.11, lng: 35.18 } }),
    locatedPhoto({ id: 'ariel-nearby', city: 'Ariel', country: 'Israel', coordinates: { lat: 32.11, lng: 35.18 } }),
  ];
  let detailIndex = 0;
  const result = await resolveDestinationImageCandidate({
    db: emptyRecommendationDb(), city: arielCity, country: israel,
    countryId: 'IL', cityId: 'ARIEL', query: "Ari'el Israel", unsplashKey: 'key',
    fetchImpl: async (url) => String(url).includes('/search/photos')
      ? { ok: true, headers: { get: () => null }, json: async () => ({ total: 2, results: photos.map(({ id }) => ({ id })) }) }
      : { ok: true, json: async () => photos[detailIndex++] },
  });
  assert.equal(result.image.source.providerPhotoId, 'ariel-nearby');
  assert.equal(result.image.selection.rank, 2);
  assert.equal(result.outcome, 'match_geo');
});

test('transient Unsplash errors do not become a no-match result', async () => {
  await assert.rejects(resolveDestinationImageCandidate({
    db: emptyRecommendationDb(), city: arielCity, country: israel,
    countryId: 'IL', cityId: 'ARIEL', query: "Ari'el Israel", unsplashKey: 'key',
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /HTTP 503/);
});

test('legacy unvalidated Unsplash images are audited once per policy version', async () => {
  const deleted = Symbol('deleted');
  let state = {};
  let resolutions = 0;
  const stateRef = {
    get: async () => ({ data: () => state }),
    set: async (patch) => {
      state = { ...state, ...patch };
      if (state.cursor === deleted) delete state.cursor;
    },
  };
  const destination = {
    status: 'active',
    destinationImage: { source: { type: 'unsplash', providerPhotoId: 'legacy-photo' }, selection: {} },
  };
  const catalogDocument = {
    id: 'IL_ARIEL',
    data: () => ({ countryId: 'IL', cityId: 'ARIEL' }),
  };
  const query = {
    orderBy() { return this; }, limit() { return this; }, startAfter() { return this; },
    get: async () => ({ docs: [catalogDocument], size: 1 }),
  };
  const db = {
    doc: (path) => path.includes('destinationImageAudits')
      ? stateRef
      : { get: async () => ({ exists: true, data: () => destination }) },
    collection: () => query,
  };
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => 'NOW', delete: () => deleted };
  const admin = { firestore };
  const resolveImage = async () => { resolutions += 1; return { state: 'ready' }; };

  const first = await auditUnvalidatedDestinationImages({ admin, unsplashKey: 'key', resolveImage });
  const second = await auditUnvalidatedDestinationImages({ admin, unsplashKey: 'key', resolveImage });
  assert.equal(first.complete, true);
  assert.equal(second.complete, true);
  assert.equal(resolutions, 1);
});

function persistenceAdmin({ recommendation = null } = {}) {
  const writes = { city: [], job: [] };
  const legacyImage = buildUnsplashDestinationImage(locatedPhoto({ id: 'EaFcpzpQuYU' }), "Ari'el Israel");
  const city = { ...arielCity, status: 'active', destinationImage: legacyImage };
  const cityRef = {
    get: async () => ({ exists: true, data: () => city }),
    update: async (patch) => { writes.city.push(patch); Object.assign(city, patch); },
  };
  const countryRef = { get: async () => ({ exists: true, data: () => ({ ...israel, status: 'active' }) }) };
  const jobRef = {
    get: async () => ({ data: () => ({ imageSync: { attempts: 0 } }) }),
    set: async (patch) => { writes.job.push(patch); },
  };
  const recommendationQuery = {
    where() { return this; }, orderBy() { return this; }, limit() { return this; }, startAfter() { return this; },
    get: async () => ({
      docs: recommendation ? [{ id: 'recommendation-1', data: () => recommendation }] : [],
      size: recommendation ? 1 : 0,
    }),
  };
  const db = {
    doc: (path) => {
      if (path === 'countries/IL/destinations/ARIEL') return cityRef;
      if (path === 'countries/IL') return countryRef;
      if (path.includes('destinationJobs')) return jobRef;
      return { path };
    },
    collection: () => recommendationQuery,
    runTransaction: async (callback) => callback({
      get: async () => ({ data: () => ({ used: 0, windowStartedAtMs: Date.now() }) }),
      set: () => {},
    }),
  };
  const deleted = Symbol('deleted');
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => 'NOW', delete: () => deleted };
  return { admin: { firestore }, writes, city };
}

test('Ariel migration replaces the rejected Jerusalem image with its recommendation image', async () => {
  const fallback = {
    status: 'active', stats: { likeCount: 1 }, createdAt: '2026-08-12',
    title: 'Sunset in Ariel', media: [asset('ariel-recommendation')],
  };
  const { admin, city } = persistenceAdmin({ recommendation: fallback });
  let calls = 0;
  const result = await resolveAndPersistDestinationImage({
    admin, countryId: 'IL', cityId: 'ARIEL', unsplashKey: 'key', force: true,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, json: async () => locatedPhoto({
            id: 'EaFcpzpQuYU', city: 'Jerusalem', country: 'Israel',
            coordinates: { lat: 31.7767, lng: 35.2345 }, description: 'Western Wall, Jerusalem',
          }) }
        : { ok: true, headers: { get: () => null }, json: async () => ({ total: 0, results: [] }) };
    },
  });
  assert.equal(result.outcome, 'zero_results');
  assert.equal(city.destinationImage.source.type, 'recommendation');
  assert.equal(city.destinationImage.source.recommendationId, 'recommendation-1');
});

test('a transient audit failure retains the current destination image and records provider_error', async () => {
  const { admin, writes, city } = persistenceAdmin();
  const originalPhotoId = city.destinationImage.source.providerPhotoId;
  const result = await resolveAndPersistDestinationImage({
    admin, countryId: 'IL', cityId: 'ARIEL', unsplashKey: 'key', force: true,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(result.state, 'retry');
  assert.equal(writes.city.length, 0);
  assert.equal(city.destinationImage.source.providerPhotoId, originalPhotoId);
  assert.equal(writes.job.at(-1).imageSync.unsplashOutcome, 'provider_error');
});
