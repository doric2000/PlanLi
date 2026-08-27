const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchGoogleReverseCountry,
  findExistingDestinationByAlias,
  finalizeDestinationChoice,
  isVerifiedCaller,
  normalizeDestinationForUse,
  parsePlaceDetails,
  resolveGoogleDestination,
  resolvePlaceCountry,
	resolveRecommendationDestinationRef,
	resolveRecommendationDestination,
	sanitizeRecommendationAttributes,
  sanitizeRecommendationCatalogContent,
  sanitizeRecommendationContent,
  sanitizeRecommendationDetails,
  normalizeExternalUrl,
  saveRecommendation,
  stableDocumentId,
  validateMediaAssets,
} = require('./recommendationService');
const { destinationClaimId, stableDestinationId } = require('./destinationV3Service');
const { canonicalDestinationId, clearRegistryCache } = require('./canonicalDestinationRegistry');
const { createResolvedPlaceToken } = require('./placesGatewayService');
const { hasHebrewName } = require('./destinationLocalizationService');

test('verified caller accepts verified password users, social users and admins', () => {
  assert.equal(
    isVerifiedCaller({
      uid: 'u1',
      token: {
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      },
    }),
    true
  );
  assert.equal(
    isVerifiedCaller({
      uid: 'u1',
      token: {
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      },
    }),
    false
  );
  assert.equal(
    isVerifiedCaller({
      uid: 'u1',
      token: { firebase: { sign_in_provider: 'google.com' } },
    }),
    true
  );
  assert.equal(isVerifiedCaller({ uid: 'u1', token: { admin: true } }), true);
});

test('catalog recommendations need only a concise classification and keep useful details optional', () => {
  const content = sanitizeRecommendationCatalogContent({
    recommendationCatalogVersion: 1,
    title: 'מקום ששווה להכיר',
    description: 'אוכל מצוין ושירות נעים.',
    categoryId: 'food',
    subcategoryIds: ['restaurant'],
    budget: 'balanced',
  });

  assert.equal(content.categoryId, 'food');
  assert.deepEqual(content.subcategoryIds, ['restaurant']);
  assert.deepEqual(content.catalogInterestIds, ['food']);
  assert.equal(content.budget, 'balanced');
  assert.throws(() => sanitizeRecommendationCatalogContent({
    recommendationCatalogVersion: 1,
    title: 'מקום ששווה להכיר',
    description: 'אוכל מצוין ושירות נעים.',
    categoryId: 'food',
    subcategoryIds: ['restaurant'],
  }), /budget/);
  assert.deepEqual(sanitizeRecommendationDetails(undefined, content), {});
  assert.deepEqual(sanitizeRecommendationDetails({
    contactName: 'דנה',
    phone: '+972 50 123 4567',
    externalUrl: 'https://planli.example/place',
  }, content), {
    contactName: 'דנה',
    phone: '+972 50 123 4567',
    externalUrl: 'https://planli.example/place',
  });
});

test('external recommendation links discard bidi formatting but reject genuinely invalid URLs', () => {
  const content = sanitizeRecommendationCatalogContent({
    recommendationCatalogVersion: 1,
    title: 'מקום ששווה להכיר',
    description: 'אוכל מצוין ושירות נעים.',
    categoryId: 'food',
    subcategoryIds: ['restaurant'],
    budget: 'balanced',
  });
  assert.equal(
    normalizeExternalUrl('\u200f https://planli.example/place\u2069'),
    'https://planli.example/place'
  );
  assert.deepEqual(sanitizeRecommendationDetails({
    externalUrl: '\u200f https://planli.example/place',
  }, content), {
    externalUrl: 'https://planli.example/place',
  });
  assert.throws(
    () => sanitizeRecommendationDetails({ externalUrl: 'not a link' }, content),
    (error) => error?.details?.reason === 'invalid_external_url' && error?.details?.retryable === false
  );
  assert.throws(
    () => sanitizeRecommendationDetails({ externalUrl: 'ftp://planli.example/place' }, content),
    (error) => error?.details?.reason === 'invalid_external_url'
  );
  assert.throws(
    () => sanitizeRecommendationDetails({ externalUrl: 123 }, content),
    (error) => error?.details?.reason === 'invalid_external_url'
  );
});

test('catalog validation keeps Other moderated and requires timing only for events', () => {
  assert.throws(() => sanitizeRecommendationCatalogContent({
    recommendationCatalogVersion: 1,
    title: 'המלצה',
    description: 'תיאור קצר',
    categoryId: 'nature',
    subcategoryIds: ['nature_other'],
    budget: 'free',
  }), /classification is invalid/);

  const other = sanitizeRecommendationCatalogContent({
    recommendationCatalogVersion: 1,
    title: 'מערת קרח',
    description: 'חוויה מיוחדת באזור.',
    categoryId: 'nature',
    subcategoryIds: ['nature_other'],
    customSubcategoryLabel: 'קרחון נגיש',
    budget: 'balanced',
  });
  assert.equal(other.customSubcategoryLabel, 'קרחון נגיש');

  const event = sanitizeRecommendationCatalogContent({
    recommendationCatalogVersion: 1,
    title: 'פסטיבל קיץ',
    description: 'מוזיקה מקומית ואוכל.',
    categoryId: 'events',
    subcategoryIds: ['music_festival'],
    budget: 'balanced',
  });
  assert.throws(() => sanitizeRecommendationDetails({}, event), /Event timing is required/);
  assert.deepEqual(sanitizeRecommendationDetails({
    eventSchedule: '12 בספטמבר 2026 בשעה 20:00',
  }, event), {
    eventSchedule: '12 בספטמבר 2026 בשעה 20:00',
  });
});

test('old Latin-only Sa Pa destination snapshots are revalidated locally without provider work', () => {
  const normalized = normalizeDestinationForUse({
    countryId: 'VN',
    countryData: { code: 'VN', name: 'וייטנאם' },
    cityData: {
      googleCache: { names: { he: 'Sa Pa', en: 'Sa Pa' }, countryCode: 'VN' },
    },
  });
  assert.equal(normalized.cityData.googleCache.names.he, 'סאפה');
  assert.equal(normalized.cityData.googleCache.nameSources.he, 'override');
  assert.equal(normalized.repairCityName, true);
});

test('administrative aliases reuse a nearby known Chiang Rai destination before Google fallback', async () => {
  const countryDocument = {
    id: 'TH',
    data: () => ({ code: 'TH', status: 'active', name: 'Thailand' }),
  };
  const catalogDocument = {
    id: 'TH_chiang-rai',
    data: () => ({
      countryId: 'TH',
      cityId: 'chiang-rai',
      status: 'active',
      names: { he: 'צ׳יאנג ראי', en: 'Chiang Rai' },
    }),
  };
  const cityData = {
    status: 'active',
    googleCache: {
      names: { he: 'צ׳יאנג ראי', en: 'Chiang Rai' },
      coordinates: { lat: 19.9105, lng: 99.8406 },
    },
  };
  const queryFor = (docs) => ({
    where: () => queryFor(docs),
    limit: () => queryFor(docs),
    get: async () => ({ docs, empty: docs.length === 0 }),
  });
  const db = {
    collection: (path) => queryFor(path === 'countries' ? [countryDocument] : [catalogDocument]),
    doc: (path) => ({
      get: async () => ({
        exists: path === 'countries/TH/destinations/chiang-rai',
        data: () => cityData,
      }),
    }),
  };

  const result = await findExistingDestinationByAlias({
    db,
    countryCode: 'TH',
    localityCandidates: ['Amphoe Mueang Chiang Rai', 'Chang Wat Chiang Rai'],
    coordinates: { lat: 19.8587, lng: 99.8416 },
  });

  assert.equal(result.countryId, 'TH');
  assert.equal(result.cityId, 'chiang-rai');
});

test('a containing PlanLi city outranks a closer administrative region without an alias match', async () => {
  const countryDocument = {
    id: 'PE',
    data: () => ({ code: 'PE', status: 'active', name: 'Peru' }),
  };
  const catalogDocuments = ['city', 'region'].map((cityId) => ({
    id: `PE_${cityId}`,
    data: () => ({
      countryId: 'PE', cityId, status: 'active',
      destinationClass: cityId === 'city' ? 'settlement' : 'administrative',
      names: cityId === 'city'
        ? { en: 'Historic Centre', he: 'המרכז ההיסטורי' }
        : { en: 'Cusco', he: 'קוסקו' },
    }),
  }));
  const city = {
    status: 'active',
    destinationType: 'city',
    googleCache: {
      names: { en: 'Historic Centre', he: 'המרכז ההיסטורי' },
      coordinates: { lat: -13.53, lng: -71.97 },
      viewport: {
        southwest: { lat: -13.60, lng: -72.05 },
        northeast: { lat: -13.45, lng: -71.90 },
      },
      types: ['locality'],
    },
  };
  const region = {
    status: 'active',
    destinationType: 'region',
    googleCache: {
      names: { en: 'Cusco', he: 'Cusco' },
      coordinates: { lat: -13.5165, lng: -71.9781 },
      types: ['administrative_area_level_1'],
    },
  };
  const queryFor = (docs) => ({
    where: () => queryFor(docs),
    limit: () => queryFor(docs),
    get: async () => ({ docs, empty: docs.length === 0 }),
  });
  const db = {
    collection: (path) => queryFor(path === 'countries' ? [countryDocument] : catalogDocuments),
    doc: (path) => ({
      get: async () => ({
        exists: true,
        data: () => path.endsWith('/city') ? city : region,
      }),
    }),
  };

  const result = await findExistingDestinationByAlias({
    db,
    countryCode: 'PE',
    localityCandidates: ['Cusco'],
    coordinates: { lat: -13.5167, lng: -71.9783 },
  });

  assert.equal(result.cityId, 'city');
  assert.equal(result.cityData.destinationType, 'city');
});

test('a Thai province outranks a non-containing same-name city', async () => {
  const countryDocument = {
    id: 'TH',
    data: () => ({ code: 'TH', status: 'active', name: 'Thailand' }),
  };
  const catalogDocuments = ['city', 'province'].map((cityId) => ({
    id: `TH_${cityId}`,
    data: () => ({
      countryId: 'TH', cityId, status: 'active', names: { en: 'Chiang Rai', he: 'Chiang Rai' },
    }),
  }));
  const city = {
    status: 'active',
    destinationType: 'city',
    googleCache: {
      coordinates: { lat: 19.89, lng: 99.89 },
      viewport: {
        southwest: { lat: 19.80, lng: 99.70 },
        northeast: { lat: 19.95, lng: 99.85 },
      },
      types: ['locality'],
    },
  };
  const province = {
    status: 'active',
    destinationType: 'region',
    googleCache: {
      coordinates: { lat: 19.91, lng: 99.84 },
      types: ['administrative_area_level_1'],
    },
  };
  const queryFor = (docs) => ({
    where: () => queryFor(docs),
    limit: () => queryFor(docs),
    get: async () => ({ docs, empty: docs.length === 0 }),
  });
  const db = {
    collection: (path) => queryFor(path === 'countries' ? [countryDocument] : catalogDocuments),
    doc: (path) => ({
      get: async () => ({
        exists: true,
        data: () => path.endsWith('/city') ? city : province,
      }),
    }),
  };

  const result = await findExistingDestinationByAlias({
    db,
    countryCode: 'TH',
    localityCandidates: ['Chiang Rai'],
    coordinates: { lat: 19.90, lng: 99.90 },
  });

  assert.equal(result.cityId, 'province');
  assert.equal(result.cityData.destinationType, 'region');
});

test('an ambiguous destination choice finalizes from transient trusted data without Google work', async () => {
  const providerRateLimitKey = 'provider-limit-secret-for-tests';
  const resolvedPlaceToken = createResolvedPlaceToken(providerRateLimitKey);
  let choiceDeleted = false;
  let tokenUpdate = null;
  const storedResolution = {
    countryId: 'TH',
    cityId: 'chiang-rai',
    countryData: { code: 'TH', name: 'Thailand', status: 'active' },
    cityData: {
      status: 'active',
      destinationType: 'city',
      googleCache: { names: { he: 'צ׳יאנג ראי', en: 'Chiang Rai' } },
    },
    createCountry: false,
    createCity: false,
    place: { placeId: 'hotel', name: 'Hotel', coordinates: { lat: 19.8, lng: 99.8 } },
  };
  const future = { toDate: () => new Date(Date.now() + 60_000) };
  const db = {
    doc: (path) => ({
      get: async () => {
        if (path === 'system/runtime/destinationResolutionChoices/dcr_12345678') {
          return { exists: true, data: () => ({
            uid: 'owner', resolvedPlaceToken, incidentId: 'loc_1234567890ab',
            providerCallCount: 2, destinationCountryCode: 'TH', expiresAt: future,
            choices: [{ choiceId: 'dc_12345678', destinationResolution: storedResolution }],
          }) };
        }
        if (path === `system/runtime/resolvedPlaceTokens/${resolvedPlaceToken}`) {
          return { exists: true, data: () => ({
            uid: 'owner', expiresAt: future,
            he: { placeId: 'hotel', countryCode: 'TH' },
            en: { placeId: 'hotel', countryCode: 'TH' },
          }) };
        }
        if (path === 'countries/TH') {
          return { exists: true, data: () => storedResolution.countryData };
        }
        if (path === 'countries/TH/destinations/chiang-rai') {
          return { exists: true, data: () => storedResolution.cityData };
        }
        return { exists: false, data: () => null };
      },
      set: async (value) => { tokenUpdate = value; },
      delete: async () => { choiceDeleted = true; },
    }),
  };
  const result = await finalizeDestinationChoice({
    admin: { firestore: () => db },
    auth: {
      uid: 'owner',
      token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
    },
    data: { resolutionId: 'dcr_12345678', destinationChoiceId: 'dc_12345678' },
    providerRateLimitKey,
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.destination.city.id, 'chiang-rai');
  assert.equal(result.resolvedPlaceToken, resolvedPlaceToken);
  assert.equal(tokenUpdate.destinationResolution.cityId, 'chiang-rai');
  assert.equal(choiceDeleted, true);
});

test('fallback destination finalization rejects a destination from another country before writing', async () => {
  const providerRateLimitKey = 'provider-limit-secret-for-tests';
  const resolvedPlaceToken = createResolvedPlaceToken(providerRateLimitKey);
  let tokenUpdated = false;
  let choiceDeleted = false;
  const future = { toDate: () => new Date(Date.now() + 60_000) };
  const db = {
    doc: (path) => ({
      get: async () => {
        if (path === 'system/runtime/destinationResolutionChoices/dcr_country1') {
          return { exists: true, data: () => ({
            uid: 'owner',
            resolvedPlaceToken,
            incidentId: 'loc_country_mismatch',
            destinationCountryCode: 'AL',
            providerCallCount: 0,
            choices: [],
            expiresAt: future,
          }) };
        }
        if (path === `system/runtime/resolvedPlaceTokens/${resolvedPlaceToken}`) {
          return { exists: true, data: () => ({
            uid: 'owner',
            expiresAt: future,
            he: { placeId: 'albania-hotel', countryCode: 'AL' },
            en: { placeId: 'albania-hotel', countryCode: 'AL' },
          }) };
        }
        if (path === 'countries/JP') {
          return { exists: true, data: () => ({ code: 'JP', name: 'יפן', status: 'active' }) };
        }
        if (path === 'countries/JP/destinations/tokyo') {
          return { exists: true, data: () => ({
            status: 'active',
            googleCache: { names: { he: 'טוקיו', en: 'Tokyo' } },
          }) };
        }
        return { exists: false, data: () => null };
      },
      set: async () => { tokenUpdated = true; },
      delete: async () => { choiceDeleted = true; },
    }),
  };

  await assert.rejects(finalizeDestinationChoice({
    admin: { firestore: () => db },
    auth: {
      uid: 'owner',
      token: { email_verified: true, firebase: { sign_in_provider: 'password' } },
    },
    data: {
      resolutionId: 'dcr_country1',
      destinationRef: { countryId: 'JP', cityId: 'tokyo' },
    },
    providerRateLimitKey,
  }), /same country/);

  assert.equal(tokenUpdated, false);
  assert.equal(choiceDeleted, false);
});

test('recommendation content ignores client-controlled ownership and location fields', () => {
  const result = sanitizeRecommendationContent({
    title: '  Good place ',
    description: 'A useful description',
    category: 'Food',
    categoryId: 'food',
    tags: ['מסעדה', 'מסעדה', 'בית קפה'],
    budget: '$$',
    userId: 'spoofed',
    countryId: 'spoofed',
    likes: 900,
    rating: 5,
  });

  assert.deepEqual(result, {
    title: 'Good place',
    description: 'A useful description',
    category: 'אוכל ושתייה',
    categoryId: 'food',
    tags: ['restaurant', 'cafe'],
    budget: 'balanced',
  });
});

test('recommendation budget keeps free and economy as separate canonical values', () => {
  assert.equal(sanitizeRecommendationContent({ ...validContent, budget: 'free' }).budget, 'free');
  assert.equal(sanitizeRecommendationContent({ ...validContent, budget: '₪' }).budget, 'economy');
});

test('recommendation content rejects unknown tag IDs and profile-only budgets', () => {
  const base = {
    title: 'Good place', description: 'Useful details', categoryId: 'food', category: 'ignored',
  };
  assert.throws(() => sanitizeRecommendationContent({ ...base, tags: ['unknown_tag'] }), /unsupported/);
  assert.throws(() => sanitizeRecommendationContent({ ...base, tags: ['viewpoint'] }), /match category/);
  assert.throws(() => sanitizeRecommendationContent({ ...base, tags: [], budget: 'flexible' }), /budget/);
});

test('taxonomy v5 recommendation attributes require only facts applicable to the selected place type', () => {
	const content = sanitizeRecommendationContent({
		taxonomyVersion: 5,
		title: 'Cafe', description: 'Useful details', categoryId: 'food', tags: ['cafe'], budget: 'balanced',
	});
	const attributes = sanitizeRecommendationAttributes({
		audienceScope: 'all', audiences: [], vibes: ['relaxed'], environment: 'indoor',
		needs: ['vegetarian'], needsConfirmed: true,
	}, content, { taxonomyVersion: 5 });
	assert.equal(attributes.audienceScope, 'all');
	assert.deepEqual(attributes.needs, ['vegetarian']);
	assert.throws(() => sanitizeRecommendationAttributes({
		audienceScope: 'all', audiences: [], vibes: [], environment: '', needs: [], needsConfirmed: false,
	}, content, { taxonomyVersion: 5 }), /vibe/);
	const service = sanitizeRecommendationContent({
		taxonomyVersion: 5,
		title: 'SIM', description: 'Useful details', categoryId: 'services', tags: ['sim_esim'], budget: 'balanced',
	});
	assert.throws(() => sanitizeRecommendationAttributes({
		audienceScope: 'all', audiences: [], vibes: [], environment: '',
		needs: ['vegetarian'], needsConfirmed: true,
	}, service, { taxonomyVersion: 5 }), /not applicable/);
});

test('place parser derives server-controlled country, city and coordinates', () => {
  const result = parsePlaceDetails({
    place_id: 'venue-1',
    name: 'Cafe',
    formatted_address: 'Cafe Street, Tel Aviv, Israel',
    address_components: [
      { long_name: 'Tel Aviv', short_name: 'Tel Aviv', types: ['locality'] },
      { long_name: 'Israel', short_name: 'IL', types: ['country'] },
    ],
    geometry: { location: { lat: 32.08, lng: 34.78 } },
  });

  assert.equal(result.placeId, 'venue-1');
  assert.equal(result.countryCode, 'IL');
  assert.equal(result.cityName, 'Tel Aviv');
  assert.deepEqual(result.coordinates, { lat: 32.08, lng: 34.78 });
});

test('Ariel and selected Israel policy areas resolve to Israel before providers', async () => {
  const result = await resolvePlaceCountry({
    parsedPlace: {
      countryName: 'Palestine',
      countryCode: 'PS',
      cityName: 'Ariel',
      coordinates: { lat: 32.1045, lng: 35.1741 },
    },
    parsedCity: null,
    mapsKey: 'unused',
  });
  assert.equal(result.countryCode, 'IL');
  assert.equal(result.countryName, 'ישראל');
  assert.equal(result.resolutionSource, 'independent-policy-registry');
});

test('country resolution uses city details when venue details omit country', async () => {
  const result = await resolvePlaceCountry({
    parsedPlace: {
      coordinates: { lat: 35.6762, lng: 139.6503 },
    },
    parsedCity: {
      countryName: 'יפן',
      countryCode: 'JP',
      coordinates: { lat: 35.6762, lng: 139.6503 },
    },
    mapsKey: 'unused',
  });
  assert.equal(result.countryCode, 'JP');
  assert.equal(result.resolutionSource, 'city-place');
});

test('country resolution prefers local boundaries before Google reverse', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (urlValue) => {
    const url = new URL(String(urlValue));
    assert.equal(url.pathname, '/maps/api/geocode/json');
    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [{
          address_components: [{
            long_name: 'צרפת',
            short_name: 'FR',
            types: ['country', 'political'],
          }],
        }],
      }),
    };
  };
  try {
    const reverse = await resolvePlaceCountry({
      parsedPlace: { coordinates: { lat: 0, lng: -30 } },
      parsedCity: null,
      mapsKey: 'maps-key',
    });
    assert.equal(reverse.countryCode, 'FR');
    assert.equal(reverse.resolutionSource, 'google-reverse');

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
    });
    const local = await resolvePlaceCountry({
      parsedPlace: { coordinates: { lat: -33.8688, lng: 151.2093 } },
      parsedCity: null,
      mapsKey: 'maps-key',
    });
    assert.equal(local.countryCode, 'AU');
    assert.equal(local.resolutionSource, 'local-boundary');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Google reverse timeout returns null instead of blocking destination fallback', async () => {
  const result = await fetchGoogleReverseCountry(
    { lat: 1, lng: 1 },
    'maps-key',
    {
      timeoutMs: 5,
      fetchImpl: (_url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    }
  );
  assert.equal(result, null);
});

test('deterministic destination IDs are stable and path-safe', () => {
  assert.equal(stableDocumentId('city', 'New York/USA'), stableDocumentId('city', 'New York/USA'));
  assert.notEqual(stableDocumentId('city', 'New York/USA'), stableDocumentId('cty', 'New York/USA'));
  assert.match(stableDocumentId('city', 'New York/USA'), /^city_[A-Za-z0-9_-]{20}$/);
});

function fakeAdminForMetadata(metadataByPath) {
  const bucket = {
    name: 'test.appspot.com',
    file: (path) => ({
      getMetadata: async () => {
        if (!metadataByPath[path]) throw new Error('missing');
        return [{ bucket: bucket.name, ...metadataByPath[path] }];
      },
    }),
  };
  return {
    storage: () => ({ bucket: () => bucket }),
  };
}

test('media validation accepts canonical WebP assets and rejects foreign ownership', async () => {
  const assetId = '123e4567-e89b-42d3-a456-426614174000';
  const metadata = (variant, ownerUid = 'u1', state = 'prepared') => ({
    size: '1024',
    contentType: 'image/webp',
    metadata: {
      ownerUid,
      assetId,
      variant,
      state,
      width: '800',
      height: '600',
      firebaseStorageDownloadTokens: `${variant}-token`,
    },
  });
  const admin = fakeAdminForMetadata({
    [`media/u1/${assetId}/large.webp`]: metadata('large'),
    [`media/u1/${assetId}/feed.webp`]: metadata('feed'),
    [`media/u1/${assetId}/thumb.webp`]: metadata('thumb'),
  });

  const [asset] = await validateMediaAssets({
    admin,
    uid: 'u1',
    mediaBucket: 'test.appspot.com',
    media: [{
      assetId,
      aspectRatio: 1,
      placeholder: { thumbhash: 'hash', color: '#112233' },
      large: { path: `media/u1/${assetId}/large.webp` },
      feed: { path: `media/u1/${assetId}/feed.webp` },
      thumb: { path: `media/u1/${assetId}/thumb.webp` },
    }],
  });
  assert.equal(asset.large.contentType, 'image/webp');
  assert.equal(asset.thumb.width, 800);
  assert.equal(asset.feed.contentType, 'image/webp');

  admin.storage = () => ({
    bucket: () => ({
      name: 'test.appspot.com',
      file: (path) => ({
        getMetadata: async () => [
          {
            bucket: 'test.appspot.com',
            ...metadata(
              path.endsWith('large.webp')
                ? 'large'
                : path.endsWith('feed.webp')
                  ? 'feed'
                  : 'thumb',
              'u2'
            ),
          },
        ],
      }),
    }),
  });
  await assert.rejects(
    validateMediaAssets({
      admin,
      uid: 'u1',
      mediaBucket: 'test.appspot.com',
      media: [{
        assetId,
        large: { path: `media/u1/${assetId}/large.webp` },
        feed: { path: `media/u1/${assetId}/feed.webp` },
        thumb: { path: `media/u1/${assetId}/thumb.webp` },
      }],
    }),
    /owner does not match/
  );

  const claimedAdmin = fakeAdminForMetadata({
    [`media/u1/${assetId}/large.webp`]: metadata('large', 'u1', 'claimed'),
    [`media/u1/${assetId}/feed.webp`]: metadata('feed', 'u1', 'claimed'),
    [`media/u1/${assetId}/thumb.webp`]: metadata('thumb', 'u1', 'claimed'),
  });
  await assert.rejects(
    validateMediaAssets({
      admin: claimedAdmin,
      uid: 'u1',
      mediaBucket: 'test.appspot.com',
      media: [{
        assetId,
        large: { path: `media/u1/${assetId}/large.webp` },
        feed: { path: `media/u1/${assetId}/feed.webp` },
        thumb: { path: `media/u1/${assetId}/thumb.webp` },
      }],
    }),
    /already been used/
  );
});

test('new recommendations cannot smuggle external media', async () => {
  await assert.rejects(
    validateMediaAssets({
      admin: fakeAdminForMetadata({}),
      uid: 'u1',
      mediaBucket: 'test.appspot.com',
      media: [{
        assetId: 'external',
        large: { url: 'https://external.example/image.jpg' },
        feed: { url: 'https://external.example/image.jpg' },
        thumb: { url: 'https://external.example/image.jpg' },
      }],
    }),
    /Invalid media descriptor/
  );
});

test('authorized edits can retain media already attached to the document', async () => {
  const assetId = '223e4567-e89b-42d3-a456-426614174000';
  const existingAsset = {
    assetId,
    aspectRatio: 1.5,
    placeholder: { thumbhash: 'trusted-hash', color: '#445566' },
    large: { path: `media/original-owner/${assetId}/large.webp`, url: 'https://trusted/large' },
    feed: { path: `media/original-owner/${assetId}/feed.webp`, url: 'https://trusted/feed' },
    thumb: { path: `media/original-owner/${assetId}/thumb.webp`, url: 'https://trusted/thumb' },
  };
  const requestedAsset = {
    ...existingAsset,
    feed: { ...existingAsset.feed, url: 'https://untrusted/client-value' },
  };

  const [retained] = await validateMediaAssets({
    admin: fakeAdminForMetadata({}),
    uid: 'admin-editor',
    mediaBucket: 'test.appspot.com',
    media: [requestedAsset],
    existingMedia: [existingAsset],
  });

  assert.deepEqual(retained, existingAsset);
  await assert.rejects(
    validateMediaAssets({
      admin: fakeAdminForMetadata({}),
      uid: 'admin-editor',
      mediaBucket: 'test.appspot.com',
      media: [requestedAsset],
      existingMedia: [],
    }),
    /outside the caller media folder/
  );
});

function createFakeAdmin(seed = {}, { beforeTransaction = null } = {}) {
  const documents = new Map(Object.entries(seed));
  let autoId = 0;
  const snapshot = (ref) => ({
    id: ref.id,
    exists: documents.has(ref.path),
    data: () => documents.get(ref.path),
  });
  const makeRef = (documentPath) => ({
    path: documentPath,
    id: documentPath.split('/').at(-1),
    get: async function get() {
      return snapshot(this);
    },
    create: async function create(data) {
      if (documents.has(this.path)) throw new Error('already exists');
      documents.set(this.path, data);
    },
    set: async function set(data, options = {}) {
      documents.set(this.path, options.merge
        ? { ...(documents.get(this.path) || {}), ...data }
        : data);
    },
    delete: async function deleteDocument() {
      documents.delete(this.path);
    },
  });
  const readField = (data, field) => field.split('.').reduce((value, key) => value?.[key], data);
  const applyUpdate = (current, patch) => {
    const next = { ...current };
    Object.entries(patch).forEach(([field, value]) => {
      if (!field.includes('.')) {
        next[field] = value;
        return;
      }
      const segments = field.split('.');
      let target = next;
      segments.slice(0, -1).forEach((segment) => {
        target[segment] = { ...(target[segment] || {}) };
        target = target[segment];
      });
      target[segments.at(-1)] = value;
    });
    return next;
  };
  const makeQuery = (collectionPath, field, operation, expected) => ({
    limit: () => makeQuery(collectionPath, field, operation, expected),
    get: async () => {
      const prefix = `${collectionPath}/`;
      const matches = [...documents.entries()]
        .filter(([documentPath, data]) => {
          const remainder = documentPath.slice(prefix.length);
          return (
            documentPath.startsWith(prefix) &&
            !remainder.includes('/') &&
            (operation === 'array-contains'
              ? Array.isArray(readField(data, field)) && readField(data, field).includes(expected)
              : readField(data, field) === expected)
          );
        })
        .map(([documentPath]) => snapshot(makeRef(documentPath)));
      return { empty: matches.length === 0, docs: matches };
    },
  });
  const db = {
    doc: makeRef,
    collection: (collectionPath) => ({
      doc: (id) => makeRef(`${collectionPath}/${id || `auto-${++autoId}`}`),
      where: (field, operation, expected) => {
        assert(['==', 'array-contains'].includes(operation));
        return makeQuery(collectionPath, field, operation, expected);
      },
    }),
    runTransaction: async (callback) => {
      if (beforeTransaction) await beforeTransaction({ documents });
      return callback({
        get: async (ref) => snapshot(ref),
        create: (ref, data) => {
          if (documents.has(ref.path)) throw new Error('already exists');
          documents.set(ref.path, data);
        },
        update: (ref, data) => {
          if (!documents.has(ref.path)) throw new Error('missing');
          documents.set(ref.path, applyUpdate(documents.get(ref.path), data));
        },
        set: (ref, data) => {
          documents.set(ref.path, { ...(documents.get(ref.path) || {}), ...data });
        },
      });
    },
  };
  return {
    documents,
    firestore: Object.assign(() => db, {
      FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
      },
    }),
    storage: () => ({
      bucket: () => ({
        name: 'test.appspot.com',
        file: () => ({ getMetadata: async () => [] }),
      }),
    }),
  };
}

const verifiedAuth = {
  uid: 'owner',
  token: {
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
  },
};
const validContent = {
  taxonomyVersion: 5,
  title: 'Server saved',
  description: 'A valid recommendation',
  category: 'Food',
  categoryId: 'food',
  tags: ['cafe'],
  budget: '$$',
  media: [],
  attributes: {
    audienceScope: 'all', audiences: [], vibes: ['relaxed'], environment: 'indoor',
    needs: [], needsConfirmed: false,
  },
};

test('saveRecommendation requires taxonomy v5 for budget-bearing writes', async () => {
  const admin = createFakeAdmin();
  await assert.rejects(saveRecommendation({
    admin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: { recommendation: { ...validContent, taxonomyVersion: 4 } },
  }), /Update PlanLi/);
});

test('Google destination resolution groups Chiang Mai places to the approved province', async () => {
  const admin = createFakeAdmin({
    'countries/TH': {
      name: 'Thailand',
      names: { he: 'Thailand', en: 'Thailand' },
      code: 'TH',
      region: 'Asia',
      currencyCode: 'THB',
      status: 'active',
    },
  });
  const selectedPlace = {
    fetchedAt: new Date(),
    he: {
      placeId: 'wat-doi-kham',
      displayName: 'Wat Phra That Doi Kham',
      countryName: 'Thailand',
      countryCode: 'TH',
      localityName: 'Mueang Chiang Mai District',
      localityCandidates: ['Mueang Chiang Mai District', 'Chiang Mai'],
      coordinates: { lat: 18.759, lng: 98.918 },
      types: ['tourist_attraction'],
    },
    en: {
      placeId: 'wat-doi-kham',
      displayName: 'Wat Phra That Doi Kham',
      countryName: 'Thailand',
      countryCode: 'TH',
      localityName: 'Mueang Chiang Mai District',
      localityCandidates: ['Mueang Chiang Mai District', 'Chiang Mai'],
      coordinates: { lat: 18.759, lng: 98.918 },
      types: ['tourist_attraction'],
    },
  };
  const searches = [];
  const originalFetch = global.fetch;
  global.fetch = async (urlValue, options = {}) => {
    const url = new URL(String(urlValue));
    if (url.pathname.endsWith('/places:autocomplete')) {
      const input = JSON.parse(options.body).input;
      searches.push(input);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: input.startsWith('Chiang Mai ')
            ? [{ placePrediction: {
                placeId: 'chiang-mai-city',
                structuredFormat: { mainText: { text: 'Chiang Mai' } },
                types: ['locality'],
              } }]
            : [],
        }),
      };
    }
    const language = url.searchParams.get('languageCode');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chiang-mai-city',
        displayName: { text: language === 'he' ? 'Chiang Mai' : 'Chiang Mai' },
        addressComponents: [
          { longText: 'Chiang Mai', types: ['locality'] },
          { longText: 'Thailand', shortText: 'TH', types: ['country'] },
        ],
        location: { latitude: 18.7883, longitude: 98.9853 },
        types: ['locality'],
      }),
    };
  };

  try {
    const destination = await resolveGoogleDestination({
      admin,
      placeId: selectedPlace.en.placeId,
      resolvedPlace: selectedPlace,
      mapsKey: 'maps-key',
      newPlacesKey: 'new-key',
      placesProvider: 'new',
    });

    assert.equal(destination.countryId, 'TH');
    assert.equal(destination.cityId, canonicalDestinationId('TH', 'th-chiang-mai'));
    assert.equal(destination.cityData.canonicalPolicy.kind, 'province');
    assert.equal(destination.cityData.googleCache.names.he, 'צ׳יאנג מאי');
    assert.deepEqual(searches, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Google destination resolution maps the reported Chiang Rai hotel to its Thai province', async () => {
  const admin = createFakeAdmin({
    'countries/TH': {
      name: 'Thailand',
      names: { he: 'Thailand', en: 'Thailand' },
      code: 'TH',
      region: 'Asia',
      currencyCode: 'THB',
      status: 'active',
    },
  });
  const coordinates = { lat: 19.9, lng: 99.9 };
  const selectedPlace = {
    fetchedAt: new Date(),
    he: {
      placeId: 'one-budget-chiangrai-bypass-east',
      displayName: 'One Budget Hotel Chiangrai Bypass-East',
      countryName: 'Thailand',
      countryCode: 'TH',
      localityName: 'Tambon Wiang Chai',
      localityCandidates: [
        'Tambon Wiang Chai',
        'Amphoe Mueang Chiang Rai',
        'Chang Wat Chiang Rai',
      ],
      coordinates,
      types: ['lodging'],
    },
    en: {
      placeId: 'one-budget-chiangrai-bypass-east',
      displayName: 'One Budget Hotel Chiangrai Bypass-East',
      countryName: 'Thailand',
      countryCode: 'TH',
      localityName: 'Tambon Wiang Chai',
      localityCandidates: [
        'Tambon Wiang Chai',
        'Amphoe Mueang Chiang Rai',
        'Chang Wat Chiang Rai',
      ],
      coordinates,
      types: ['lodging'],
    },
  };
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (urlValue) => {
    const url = new URL(String(urlValue));
    if (url.pathname.endsWith('/geocode/json')) {
      calls.push('geocode');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          results: [
            {
              place_id: 'wiang-chai-town',
              types: ['administrative_area_level_3', 'political'],
              address_components: [
                { long_name: 'Thailand', short_name: 'TH', types: ['country'] },
              ],
              geometry: { location: coordinates },
            },
            {
              place_id: 'chiang-rai-province',
              types: ['administrative_area_level_1', 'political'],
              address_components: [
                { long_name: 'Thailand', short_name: 'TH', types: ['country'] },
              ],
              geometry: { location: { lat: 19.91, lng: 99.84 } },
            },
          ],
        }),
      };
    }
    calls.push(`details:${url.searchParams.get('languageCode')}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chiang-rai-province',
        displayName: { text: 'Chiang Rai' },
        addressComponents: [
          { longText: 'Chiang Rai', types: ['administrative_area_level_1', 'political'] },
          { longText: 'Thailand', shortText: 'TH', types: ['country', 'political'] },
        ],
        location: { latitude: 19.91, longitude: 99.84 },
        types: ['administrative_area_level_1', 'political'],
      }),
    };
  };

  try {
    const destination = await resolveGoogleDestination({
      admin,
      placeId: selectedPlace.en.placeId,
      resolvedPlace: selectedPlace,
      mapsKey: 'maps-key',
      newPlacesKey: 'new-key',
      placesProvider: 'new',
    });

    assert.equal(destination.countryId, 'TH');
    assert.equal(destination.cityId, canonicalDestinationId('TH', 'th-chiang-rai'));
    assert.equal(destination.cityData.destinationType, 'region');
    assert.deepEqual(calls, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Google destination resolution rejects an unapproved locality instead of creating it', async () => {
  const admin = createFakeAdmin({
    'countries/AL': {
      name: 'Albania',
      names: { he: 'Albania', en: 'Albania' },
      code: 'AL',
      region: 'Europe',
      currencyCode: 'ALL',
      status: 'active',
    },
  });
  const coordinates = { lat: 40.4146218, lng: 19.4811959 };
  const selectedPlace = {
    fetchedAt: new Date(),
    he: {
      placeId: 'hotel-liro',
      displayName: 'Hotel Liro',
      countryName: 'Albania',
      countryCode: 'AL',
      localityName: 'Vlora',
      localityCandidates: ['Vlora', 'Qarku i Vlorës'],
      coordinates,
      types: ['hotel', 'lodging'],
    },
    en: {
      placeId: 'hotel-liro',
      displayName: 'Hotel Liro',
      countryName: 'Albania',
      countryCode: 'AL',
      localityName: 'Vlora',
      localityCandidates: ['Vlora', 'Qarku i Vlorës'],
      coordinates,
      types: ['hotel', 'lodging'],
    },
  };
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (urlValue) => {
    const url = new URL(String(urlValue));
    if (url.pathname.endsWith('/geocode/json')) {
      calls.push('geocode');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          results: [{
            place_id: 'vlore-municipality',
            types: ['administrative_area_level_2', 'political'],
            address_components: [
              { long_name: 'Albania', short_name: 'AL', types: ['country'] },
            ],
            geometry: { location: { lat: 40.4659588, lng: 19.4907121 } },
          }],
        }),
      };
    }
    calls.push(`details:${url.searchParams.get('languageCode')}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'vlore-municipality',
        displayName: { text: 'Vlorë' },
        addressComponents: [
          { longText: 'Vlorë', types: ['administrative_area_level_2', 'political'] },
          { longText: 'Albania', shortText: 'AL', types: ['country', 'political'] },
        ],
        location: { latitude: 40.4659588, longitude: 19.4907121 },
        types: ['administrative_area_level_2', 'political'],
      }),
    };
  };

  try {
    await assert.rejects(resolveGoogleDestination({
      admin,
      placeId: selectedPlace.en.placeId,
      resolvedPlace: selectedPlace,
      mapsKey: 'maps-key',
      newPlacesKey: 'new-key',
      placesProvider: 'new',
    }), /not mapped to an approved PlanLi destination/);
    assert.deepEqual(calls, ['details:en']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('the current client receives destination search state instead of an unknown-destination error', async () => {
  clearRegistryCache();
  const providerRateLimitKey = 'provider-limit-secret-for-tests';
  const resolvedPlaceToken = createResolvedPlaceToken(providerRateLimitKey);
  const coordinates = { lat: 40.4146218, lng: 19.4811959 };
  const expiresAt = { toDate: () => new Date(Date.now() + 60_000) };
  const admin = createFakeAdmin({
    'countries/AL': {
      name: 'אלבניה', names: { he: 'אלבניה', en: 'Albania' }, code: 'AL',
      region: 'Europe', currencyCode: 'ALL', status: 'active',
    },
    [`system/runtime/resolvedPlaceTokens/${resolvedPlaceToken}`]: {
      uid: 'owner', expiresAt, incidentId: 'loc_vlorefallback', providerCallCount: 1,
      he: {
        placeId: 'hotel-liro', displayName: 'Hotel Liro', countryName: 'Albania',
        countryCode: 'AL', localityName: 'Vlora', localityCandidates: ['Vlora'],
        coordinates, types: ['hotel', 'lodging'],
      },
      en: {
        placeId: 'hotel-liro', displayName: 'Hotel Liro', countryName: 'Albania',
        countryCode: 'AL', localityName: 'Vlora', localityCandidates: ['Vlora'],
        coordinates, types: ['hotel', 'lodging'],
      },
    },
  });

  try {
    const result = await resolveRecommendationDestination({
      admin,
      auth: verifiedAuth,
      providerRateLimitKey,
      placesProvider: 'legacy',
      data: {
        resolvedPlaceToken,
        supportsDestinationChoice: true,
        supportsDestinationSearch: true,
      },
    });
    assert.equal(result.status, 'destination_choice_required');
    assert.equal(result.allowDestinationSearch, true);
    assert.deepEqual(result.alternatives, []);
    assert.match(result.resolutionId, /^dcr_/);
  } finally {
    clearRegistryCache();
  }
});

test('an explicitly confirmed worldwide destination becomes a stable provisional destination', async () => {
  const admin = createFakeAdmin({
    'countries/IL': {
      name: 'ישראל', names: { he: 'ישראל', en: 'Israel' }, code: 'IL',
      region: 'Asia', currencyCode: 'ILS', status: 'active',
    },
  });
  const coordinates = { lat: 31.932111, lng: 34.801327 };
  const resolvedPlace = {
    fetchedAt: new Date(),
    he: {
      placeId: 'ness-ziona-place', displayName: 'נס ציונה', localityName: 'נס ציונה',
      countryName: 'ישראל', countryCode: 'IL', localityCandidates: ['נס ציונה'],
      coordinates, types: ['locality', 'political'],
    },
    en: {
      placeId: 'ness-ziona-place', displayName: 'Ness Ziona', localityName: 'Ness Ziona',
      countryName: 'Israel', countryCode: 'IL', localityCandidates: ['Ness Ziona'],
      coordinates, types: ['locality', 'political'],
    },
  };
  const confirmation = await resolveGoogleDestination({
    admin, selectionIntent: 'destination', placesProvider: 'new', resolvedPlace,
  });
  assert.equal(confirmation.status, 'destination_name_confirmation_required');
  assert.equal(confirmation.nameConfirmation.suggestedHebrewName, 'נס ציונה');

  const destination = await resolveGoogleDestination({
    admin,
    selectionIntent: 'destination',
    confirmedHebrewName: 'נס ציונה',
    placesProvider: 'new',
    resolvedPlace,
  });
  assert.equal(destination.cityData.canonicalPolicy.approved, false);
  assert.equal(destination.cityData.canonicalPolicy.provisional, true);
  assert.equal(destination.cityData.canonicalPolicy.selectionSource, 'user_confirmed_destination');
  assert.equal(destination.cityData.googleCache.names.he, 'נס ציונה');
  assert.equal(destination.createCity, true);
});

test('a worldwide destination without reliable Hebrew asks for explicit name confirmation', async () => {
  const admin = createFakeAdmin();
  const coordinates = { lat: 60.3913, lng: 5.3221 };
  const destination = await resolveGoogleDestination({
    admin,
    selectionIntent: 'destination',
    placesProvider: 'new',
    resolvedPlace: {
      fetchedAt: new Date(),
      he: {
        placeId: 'bergen-place', displayName: 'Bergen', localityName: 'Bergen',
        countryName: 'Norway', countryCode: 'NO', localityCandidates: ['Bergen'],
        coordinates, types: ['locality', 'political'],
      },
      en: {
        placeId: 'bergen-place', displayName: 'Bergen', localityName: 'Bergen',
        countryName: 'Norway', countryCode: 'NO', localityCandidates: ['Bergen'],
        coordinates, types: ['locality', 'political'],
      },
    },
  });
  assert.equal(destination.status, 'destination_name_confirmation_required');
  assert.equal(destination.requiresNameConfirmation, true);
  assert.equal(destination.nameConfirmation.englishName, 'Bergen');
  assert.ok(hasHebrewName(destination.nameConfirmation.suggestedHebrewName));
});

test('saveRecommendation creates against an existing destination and owns server fields', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL', status: 'active' },
    'countries/IL/destinations/TLV': {
      name: 'Tel Aviv',
      providerIds: { googlePlaceIds: ['city-1'] },
      status: 'active',
      stats: { recommendationCount: 0 },
    },
  });

  const result = await saveRecommendation({
    admin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: {
      destinationRef: { countryId: 'IL', cityId: 'TLV' },
      recommendation: {
        ...validContent,
        userId: 'attacker',
        likes: 900,
      },
    },
  });

  const saved = admin.documents.get(`recommendations/${result.recommendationId}`);
  assert.equal(saved.ownerId, 'owner');
  assert.deepEqual(saved.stats, { likeCount: 0, commentCount: 0 });
  assert.equal(saved.destination.countryId, 'IL');
  assert.equal(saved.destination.cityId, 'TLV');
	assert.equal(saved.taxonomyVersion, 5);
  assert.ok(Array.isArray(saved.search.prefixes));
  assert.equal(Object.hasOwn(saved.search, 'tokens'), false);
  assert.ok(Array.isArray(saved.search.prefixes));
  assert.equal(saved.createdAt, 'SERVER_TIMESTAMP');
});

test('canonical destination wins when an inactive merged source shares its provider identity', async () => {
  clearRegistryCache();
  const registryId = 'zz-canonical-hub';
  const canonicalId = canonicalDestinationId('ZZ', registryId);
  const providerPlaceId = 'shared-canonical-place';
  const canonicalPolicy = {
    approved: true, registryId, kind: 'city_hub', groupingPolicy: 'self', registryVersion: 1,
  };
  const admin = createFakeAdmin({
    'countries/ZZ': {
      name: 'זדלנד', names: { he: 'זדלנד', en: 'Zedland' }, code: 'ZZ',
      region: 'Test', currencyCode: 'ZZZ', status: 'active',
    },
    'countries/ZZ/destinations/dst_00000000000000000000': {
      status: 'inactive', providerRefs: { googlePlaceId: providerPlaceId },
      mergedInto: { countryId: 'ZZ', cityId: canonicalId },
    },
    [`countries/ZZ/destinations/${canonicalId}`]: {
      status: 'active', destinationType: 'city', providerRefs: { googlePlaceId: providerPlaceId },
      canonicalPolicy,
      googleCache: {
        names: { he: 'יעד קנוני', en: 'Canonical Hub' },
        coordinates: { lat: 1, lng: 1 },
      },
    },
    [`system/destinationRegistry/entries/${registryId}`]: {
      countryCode: 'ZZ', names: { he: 'יעד קנוני', en: 'Canonical Hub' },
      aliases: ['Canonical Hub'], kind: 'city_hub', groupingPolicy: 'self',
      providerRefs: { googlePlaceId: providerPlaceId }, center: { lat: 1, lng: 1 },
      radiusKm: 10, status: 'active', registryVersion: 1,
    },
  });
  const selectedPlace = {
    fetchedAt: new Date(),
    he: {
      placeId: 'selected-poi', displayName: 'Attraction', countryName: 'Zedland',
      countryCode: 'ZZ', localityName: 'Canonical Hub', localityCandidates: ['Canonical Hub'],
      coordinates: { lat: 1, lng: 1 }, types: ['tourist_attraction'],
    },
    en: {
      placeId: 'selected-poi', displayName: 'Attraction', countryName: 'Zedland',
      countryCode: 'ZZ', localityName: 'Canonical Hub', localityCandidates: ['Canonical Hub'],
      coordinates: { lat: 1, lng: 1 }, types: ['tourist_attraction'],
    },
  };

  try {
    const destination = await resolveGoogleDestination({
      admin, placeId: selectedPlace.en.placeId, resolvedPlace: selectedPlace,
      mapsKey: 'unused', newPlacesKey: 'unused', placesProvider: 'new',
    });
    assert.equal(destination.cityId, canonicalId);
    assert.equal(destination.cityData.status, 'active');
  } finally {
    clearRegistryCache();
  }
});

test('saveRecommendation rejects a destination locked after resolution but before its write transaction', async () => {
  const destinationPath = 'countries/IL/destinations/TLV';
  let locked = false;
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL', status: 'active' },
    [destinationPath]: {
      name: 'Tel Aviv', status: 'active', stats: { recommendationCount: 0 },
    },
  }, {
    beforeTransaction: ({ documents }) => {
      if (locked) return;
      locked = true;
      documents.set(destinationPath, {
        ...documents.get(destinationPath),
        reassignment: { state: 'reassigning', jobId: 'job-1' },
      });
    },
  });

  await assert.rejects(saveRecommendation({
    admin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: {
      destinationRef: { countryId: 'IL', cityId: 'TLV' },
      recommendation: validContent,
    },
  }), /no longer active/);
  assert.equal([...admin.documents.keys()].some((path) => path.startsWith('recommendations/')), false);
});

test('recommendation edits cannot race a reassignment by removing its locked source destination', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'ישראל', code: 'IL', status: 'active' },
    'countries/IL/destinations/source': {
      name: 'יעד מקור', names: { he: 'יעד מקור', en: 'Source' },
      status: 'active', stats: { recommendationCount: 1 },
      reassignment: { state: 'reassigning', jobId: 'job-1' },
    },
    'countries/IL/destinations/target': {
      name: 'יעד חדש', names: { he: 'יעד חדש', en: 'Target' },
      status: 'active', stats: { recommendationCount: 0 },
    },
    'recommendations/recommendation-1': {
      ...validContent,
      ownerId: 'owner', status: 'active', stats: { likeCount: 0, commentCount: 0 },
      destination: { countryId: 'IL', cityId: 'source', countryName: 'ישראל', cityName: 'יעד מקור' },
    },
  });

  await assert.rejects(saveRecommendation({
    admin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: {
      recommendationId: 'recommendation-1',
      destinationRef: { countryId: 'IL', cityId: 'target' },
      recommendation: validContent,
    },
  }), /being reassigned/);
  assert.equal(admin.documents.get('recommendations/recommendation-1').destination.cityId, 'source');
});

test('provider destination references use the submitted resolver and reject canonical mismatches', async () => {
  const admin = createFakeAdmin();
  let submittedRequest;
  const resolved = {
    countryId: 'GR',
    cityId: 'dst_mykonos',
    place: { placeId: 'google-mykonos' },
  };
  const result = await resolveRecommendationDestinationRef({
    admin,
    auth: verifiedAuth,
    destinationRef: {
      countryId: 'GR',
      cityId: 'dst_mykonos',
      provider: 'google',
      providerPlaceId: 'google-mykonos',
      resolvedPlaceToken: 'resolved-token-1',
    },
    resolveExisting: async () => assert.fail('provider destinations must not require an existing catalog document'),
    resolveSubmitted: async (request) => {
      submittedRequest = request;
      return resolved;
    },
  });
  assert.equal(result, resolved);
  assert.equal(submittedRequest.placeId, 'google-mykonos');
  assert.equal(submittedRequest.resolvedPlaceToken, 'resolved-token-1');

  await assert.rejects(() => resolveRecommendationDestinationRef({
    admin,
    auth: verifiedAuth,
    destinationRef: {
      countryId: 'IT',
      cityId: 'dst_venice',
      providerPlaceId: 'google-venice',
    },
    resolveSubmitted: async () => ({ countryId: 'IT', cityId: 'dst_rome' }),
  }), /does not match/);
});

test('provider destination publication strips the provider place and keeps only a manual pin', async () => {
  const destinationDocuments = {
    'countries/GR': { name: 'יוון', names: { he: 'יוון', en: 'Greece' }, code: 'GR', status: 'active' },
    'countries/GR/destinations/dst_mykonos': {
      name: 'מיקונוס',
      names: { he: 'מיקונוס', en: 'Mykonos' },
      status: 'active',
      stats: { recommendationCount: 0 },
      googleCache: {
        coordinates: { lat: 37.45, lng: 25.33 },
        viewport: {
          southwest: { lat: 37.3, lng: 25.1 },
          northeast: { lat: 37.6, lng: 25.5 },
        },
      },
    },
  };
  const catalogContent = {
    taxonomyVersion: 5,
    recommendationCatalogVersion: 1,
    title: 'מיקונוס',
    description: 'המלצה חדשה באי.',
    categoryId: 'nature',
    subcategoryIds: ['beach'],
    budget: 'balanced',
    details: {},
    media: [],
  };
  const providerDestination = (admin) => async () => ({
    countryId: 'GR',
    cityId: 'dst_mykonos',
    countryRef: admin.firestore().doc('countries/GR'),
    cityRef: admin.firestore().doc('countries/GR/destinations/dst_mykonos'),
    countryData: destinationDocuments['countries/GR'],
    cityData: destinationDocuments['countries/GR/destinations/dst_mykonos'],
    createCountry: false,
    createCity: false,
    place: { placeId: 'google-mykonos', coordinates: { lat: 37.45, lng: 25.33 } },
  });
  const destinationRef = {
    countryId: 'GR',
    cityId: 'dst_mykonos',
    provider: 'google',
    providerPlaceId: 'google-mykonos',
    resolvedPlaceToken: 'resolved-token-1',
  };

  const generalAdmin = createFakeAdmin(destinationDocuments);
  const generalResult = await saveRecommendation({
    admin: generalAdmin,
    auth: verifiedAuth,
    data: { destinationRef, locationMode: 'destination', recommendation: catalogContent },
    resolveDestinationRef: providerDestination(generalAdmin),
  });
  const generalSaved = generalAdmin.documents.get(`recommendations/${generalResult.recommendationId}`);
  assert.equal(generalSaved.locationMode, 'destination');
  assert.equal(generalSaved.place, null);
  assert.equal(generalSaved.mapLocation, null);

  const pinAdmin = createFakeAdmin(destinationDocuments);
  const pinResult = await saveRecommendation({
    admin: pinAdmin,
    auth: verifiedAuth,
    data: {
      destinationRef,
      locationMode: 'pin',
      manualLocation: { coordinates: { lat: 37.46, lng: 25.34 } },
      recommendation: catalogContent,
    },
    resolveDestinationRef: providerDestination(pinAdmin),
  });
  const pinSaved = pinAdmin.documents.get(`recommendations/${pinResult.recommendationId}`);
  assert.equal(pinSaved.locationMode, 'pin');
  assert.equal(pinSaved.place.source, 'manual_pin');
  assert.equal(pinSaved.place.placeId, undefined);
  assert.deepEqual(pinSaved.place.coordinates, { lat: 37.46, lng: 25.34 });
});

test('catalog recommendations support a general destination and a nearby manual pin', async () => {
  const destinationDocuments = {
    'countries/HU': {
      name: 'הונגריה', names: { he: 'הונגריה', en: 'Hungary' }, code: 'HU', status: 'active',
    },
    'countries/HU/destinations/budapest': {
      name: 'בודפשט',
      names: { he: 'בודפשט', en: 'Budapest' },
      status: 'active',
      stats: { recommendationCount: 0 },
      googleCache: {
        coordinates: { lat: 47.4979, lng: 19.0402 },
        viewport: {
          southwest: { lat: 47.35, lng: 18.9 },
          northeast: { lat: 47.65, lng: 19.2 },
        },
      },
    },
  };
  const catalogContent = {
    taxonomyVersion: 5,
    recommendationCatalogVersion: 1,
    title: 'מקום מקומי ששווה להכיר',
    description: 'המלצה קצרה בלי שאלון ארוך.',
    categoryId: 'food',
    subcategoryIds: ['cafe'],
    budget: 'economy',
    details: { phone: '+36 20 123 4567' },
    media: [],
  };

  const generalAdmin = createFakeAdmin(destinationDocuments);
  const generalResult = await saveRecommendation({
    admin: generalAdmin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: {
      destinationRef: { countryId: 'HU', cityId: 'budapest' },
      locationMode: 'destination',
      recommendation: catalogContent,
    },
  });
  const generalSaved = generalAdmin.documents.get(`recommendations/${generalResult.recommendationId}`);
  assert.equal(generalSaved.locationMode, 'destination');
  assert.equal(generalSaved.place, null);
  assert.deepEqual(generalSaved.subcategoryIds, ['cafe']);
  assert.deepEqual(generalSaved.details, { phone: '+36 20 123 4567' });
  assert.ok(generalSaved.facets.interests.includes('food'));
  assert.deepEqual(generalSaved.facets.catalogInterests, ['food']);

  await assert.rejects(() => saveRecommendation({
    admin: generalAdmin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: {
      recommendationId: generalResult.recommendationId,
      destinationRef: { countryId: 'HU', cityId: 'budapest' },
      recommendation: {
        taxonomyVersion: 5,
        title: 'עריכה מגרסה ישנה',
        description: 'אסור לאבד את הסיווג החדש.',
        categoryId: 'food',
        tags: ['cafe'],
        budget: 'economy',
        media: [],
      },
    },
  }), /Update PlanLi before editing/);

  for (const invalidLocation of [
    { locationMode: 'pin' },
    { locationMode: 'exact' },
  ]) {
    await assert.rejects(() => saveRecommendation({
      admin: createFakeAdmin(destinationDocuments),
      auth: verifiedAuth,
      mapsKey: 'unused',
      data: {
        destinationRef: { countryId: 'HU', cityId: 'budapest' },
        ...invalidLocation,
        recommendation: catalogContent,
      },
    }), /map pin is required|exact place is required/i);
  }

  const pinAdmin = createFakeAdmin(destinationDocuments);
  const pinResult = await saveRecommendation({
    admin: pinAdmin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: {
      destinationRef: { countryId: 'HU', cityId: 'budapest' },
      locationMode: 'pin',
      manualLocation: { coordinates: { lat: 47.5, lng: 19.05 } },
      recommendation: catalogContent,
    },
  });
  const pinSaved = pinAdmin.documents.get(`recommendations/${pinResult.recommendationId}`);
  assert.equal(pinSaved.locationMode, 'pin');
  assert.equal(pinSaved.place.source, 'manual_pin');
  assert.deepEqual(pinSaved.place.coordinates, { lat: 47.5, lng: 19.05 });
});

test('saveRecommendation repairs an existing Latin-only Sa Pa destination without Google calls', async () => {
  const admin = createFakeAdmin({
    'countries/VN': { name: 'וייטנאם', code: 'VN', status: 'active' },
    'countries/VN/destinations/SA_PA': {
      status: 'active',
      googleCache: { names: { he: 'Sa Pa', en: 'Sa Pa' }, countryCode: 'VN' },
      stats: { recommendationCount: 0 },
    },
  });
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => { providerCalls += 1; throw new Error('provider must not be called'); };
  try {
    const result = await saveRecommendation({
      admin,
      auth: verifiedAuth,
      mapsKey: 'unused',
      data: {
        destinationRef: { countryId: 'VN', cityId: 'SA_PA' },
        recommendation: validContent,
      },
    });
    const saved = admin.documents.get(`recommendations/${result.recommendationId}`);
    const destination = admin.documents.get('countries/VN/destinations/SA_PA');
    assert.equal(saved.destination.cityName, 'סאפה');
    assert.equal(destination.googleCache.names.he, 'סאפה');
    assert.equal(destination.googleCache.nameSources.he, 'override');
    assert.equal(providerCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishRequestId makes create retries idempotent without incrementing destination stats twice', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL', status: 'active' },
    'countries/IL/destinations/TLV': {
      name: 'Tel Aviv', status: 'active', stats: { recommendationCount: 0 },
    },
  });
  const data = {
    publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
    destinationRef: { countryId: 'IL', cityId: 'TLV' },
    recommendation: validContent,
  };

  const first = await saveRecommendation({ admin, auth: verifiedAuth, mapsKey: 'unused', data });
  const replay = await saveRecommendation({ admin, auth: verifiedAuth, mapsKey: 'unused', data });

  assert.equal(replay.recommendationId, first.recommendationId);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(Object.hasOwn(admin.documents.get(`recommendations/${first.recommendationId}`), 'publishRequestId'), false);
  assert.equal(
    admin.documents.get('countries/IL/destinations/TLV').stats.recommendationCount,
    1
  );
  assert.equal(
    Array.from(admin.documents.keys()).filter((path) => path.startsWith('recommendations/')).length,
    1
  );
});

test('publishRequestId rejects malformed create IDs and cannot be combined with edit IDs', async () => {
  const admin = createFakeAdmin();
  await assert.rejects(
    saveRecommendation({
      admin, auth: verifiedAuth, mapsKey: 'unused',
      data: { publishRequestId: 'not-a-uuid', recommendation: validContent },
    }),
    /publishRequestId/
  );
  await assert.rejects(
    saveRecommendation({
      admin, auth: verifiedAuth, mapsKey: 'unused',
      data: {
        recommendationId: 'existing',
        publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
        recommendation: validContent,
      },
    }),
    /only supported when creating/
  );
});

test('admin edits retain the original owner media without trusting client media fields', async () => {
  const assetId = '323e4567-e89b-42d3-a456-426614174000';
  const existingAsset = {
    assetId,
    aspectRatio: 1.5,
    placeholder: { thumbhash: 'server-hash', color: '#334455' },
    large: { path: `media/original-owner/${assetId}/large.webp`, url: 'https://trusted/large' },
    feed: { path: `media/original-owner/${assetId}/feed.webp`, url: 'https://trusted/feed' },
    thumb: { path: `media/original-owner/${assetId}/thumb.webp`, url: 'https://trusted/thumb' },
  };
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL', status: 'active' },
    'countries/IL/destinations/TLV': {
      name: 'Tel Aviv', status: 'active', stats: { recommendationCount: 1 },
    },
    'recommendations/admin-edit': {
      ownerId: 'original-owner',
      createdAt: 'ORIGINAL',
      destination: { countryId: 'IL', cityId: 'TLV' },
      media: [existingAsset],
      stats: { likeCount: 2, commentCount: 1 },
    },
    'system/moderation/admins/admin-editor': { active: true },
  });

  await saveRecommendation({
    admin,
    auth: { uid: 'admin-editor', token: { admin: true } },
    mediaBucket: 'test.appspot.com',
    mapsKey: 'unused',
    data: {
      recommendationId: 'admin-edit',
      destinationRef: { countryId: 'IL', cityId: 'TLV' },
      recommendation: {
        ...validContent,
        media: [{
          ...existingAsset,
          feed: { ...existingAsset.feed, url: 'https://untrusted/client-value' },
        }],
      },
    },
  });

  const saved = admin.documents.get('recommendations/admin-edit');
  assert.equal(saved.ownerId, 'original-owner');
  assert.deepEqual(saved.media, [existingAsset]);
});

test('recommendation edits preserve hidden state instead of reactivating content', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL', status: 'active' },
    'countries/IL/destinations/TLV': {
      name: 'Tel Aviv', status: 'active', stats: { recommendationCount: 1 },
    },
    'countries/IL/destinations/JLM': {
      name: 'Jerusalem', status: 'active', stats: { recommendationCount: 0 },
    },
    'recommendations/hidden-edit': {
      ownerId: 'owner',
      createdAt: 'ORIGINAL',
      destination: { countryId: 'IL', cityId: 'TLV' },
      media: [],
      status: 'inactive',
      stats: { likeCount: 2, commentCount: 1 },
    },
  });

  await saveRecommendation({
    admin,
    auth: verifiedAuth,
    mapsKey: 'unused',
    data: {
      recommendationId: 'hidden-edit',
      destinationRef: { countryId: 'IL', cityId: 'JLM' },
      recommendation: validContent,
    },
  });

  assert.equal(admin.documents.get('recommendations/hidden-edit').status, 'inactive');
  assert.equal(admin.documents.get('countries/IL/destinations/TLV').stats.recommendationCount, 1);
  assert.equal(admin.documents.get('countries/IL/destinations/JLM').stats.recommendationCount, 0);
});

test('existing destinations under inactive countries cannot be reused', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL', status: 'inactive' },
    'countries/IL/destinations/TLV': { name: 'Tel Aviv', status: 'active' },
  });
  await assert.rejects(
    saveRecommendation({
      admin,
      auth: verifiedAuth,
      mapsKey: 'unused',
      data: {
        destinationRef: { countryId: 'IL', cityId: 'TLV' },
        recommendation: validContent,
      },
    }),
    (error) => error?.message === 'Destination is not active.' &&
      error?.details?.reason === 'destination_not_found' &&
      error?.details?.retryable === false
  );
});

test('saveRecommendation rejects unverified and foreign edits', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL', status: 'active' },
    'countries/IL/destinations/TLV': { name: 'Tel Aviv', status: 'active' },
    'recommendations/foreign': {
      ownerId: 'someone-else',
      createdAt: 'ORIGINAL',
      media: [],
    },
  });

  await assert.rejects(
    saveRecommendation({
      admin,
      auth: {
        uid: 'owner',
        token: {
          email_verified: false,
          firebase: { sign_in_provider: 'password' },
        },
      },
      data: {
        destinationRef: { countryId: 'IL', cityId: 'TLV' },
        recommendation: validContent,
      },
      mapsKey: 'unused',
    }),
    /Email verification/
  );
  await assert.rejects(
    saveRecommendation({
      admin,
      auth: verifiedAuth,
      data: {
        recommendationId: 'foreign',
        destinationRef: { countryId: 'IL', cityId: 'TLV' },
        recommendation: validContent,
      },
      mapsKey: 'unused',
    }),
    /do not own/
  );
});

test('Google place cannot create an unapproved destination document', async () => {
  const admin = createFakeAdmin();
  const originalFetch = global.fetch;
  global.fetch = async (urlValue) => {
    const url = new URL(String(urlValue));
    if (url.hostname === 'api.restcountries.com') {
      return {
        ok: true,
        json: async () => ({
          data: {
            objects: [{
              codes: { alpha_2: 'IL' },
              region: 'Asia',
              currencies: [{ code: 'ILS' }],
            }],
          },
        }),
      };
    }
    if (url.pathname.includes('/autocomplete/')) {
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          predictions: [{ place_id: 'city-google-id', structured_formatting: { main_text: 'Tel Aviv' } }],
        }),
      };
    }
    const requestedPlaceId = url.searchParams.get('place_id');
    assert.equal(url.searchParams.get('fields').includes('rating'), false);
    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          place_id: requestedPlaceId,
          name: requestedPlaceId === 'venue-google-id' ? 'Cafe' : 'Tel Aviv',
          formatted_address: 'Tel Aviv, Israel',
          address_components: [
            { long_name: 'Tel Aviv', short_name: 'Tel Aviv', types: ['locality'] },
            { long_name: 'Israel', short_name: 'IL', types: ['country'] },
          ],
          geometry: { location: { lat: 32.08, lng: 34.78 } },
          types: requestedPlaceId === 'venue-google-id' ? ['restaurant'] : ['locality', 'political'],
        },
      }),
    };
  };

  try {
    await assert.rejects((async () => {
    const result = await saveRecommendation({
      admin,
      auth: verifiedAuth,
      mapsKey: 'secret-key',
      restCountriesKey: 'rest-secret',
      data: {
        placeId: 'venue-google-id',
        recommendation: validContent,
      },
    });

    const countryId = 'IL';
    const cityId = stableDestinationId(countryId, 'city-google-id');
    assert.equal(result.country.id, countryId);
    assert.equal(result.city.id, cityId);
    assert.equal(admin.documents.get(`countries/${countryId}`).code, 'IL');
    assert.deepEqual(
      Object.keys(admin.documents.get(`countries/${countryId}`)).sort(),
      ['code', 'createdAt', 'currencyCode', 'name', 'names', 'region', 'status', 'updatedAt']
    );
    assert.deepEqual(
      admin.documents.get(`countries/${countryId}/destinations/${cityId}`).providerRefs.googlePlaceId,
      'city-google-id'
    );
    const claimId = destinationClaimId({ countryId, type: 'city', nameEn: 'Tel Aviv' });
    assert.deepEqual(
      admin.documents.get(`system/runtime/destinationClaims/${claimId}`).entries,
      { [cityId]: { providerPlaceId: 'city-google-id' } }
    );
    assert.equal(
      Object.hasOwn(admin.documents.get(`countries/${countryId}/destinations/${cityId}`), 'rating'),
      false
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        admin.documents.get(`countries/${countryId}/destinations/${cityId}`),
        'createdBy'
      ),
      false
    );
    assert.equal(
      admin.documents.get(`recommendations/${result.recommendationId}`).place.placeId,
      'venue-google-id'
    );
    const mapLocation = admin.documents.get(`recommendations/${result.recommendationId}`).mapLocation;
    assert.deepEqual(
      { lat: mapLocation.lat, lng: mapLocation.lng },
      { lat: 32.08, lng: 34.78 }
    );
    assert.ok(mapLocation.geohash);
    })(), /not mapped to an approved PlanLi destination/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('same-name raw localities cannot bypass the approved registry', async () => {
  const admin = createFakeAdmin({
    'countries/US': {
      name: 'ארצות הברית', names: { he: 'ארצות הברית', en: 'United States' },
      code: 'US', region: 'Americas', currencyCode: 'USD', status: 'active',
    },
  });
  const originalFetch = global.fetch;
  global.fetch = async (urlValue) => {
    const url = new URL(String(urlValue));
    const placeId = url.searchParams.get('place_id');
    const second = placeId === 'springfield-b';
    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          place_id: placeId,
          name: 'Springfield',
          formatted_address: 'Springfield, United States',
          address_components: [
            { long_name: 'Springfield', types: ['locality', 'political'] },
            { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
          ],
          geometry: { location: { lat: second ? 44.05 : 39.78, lng: second ? -123.02 : -89.64 } },
          types: ['locality', 'political'],
        },
      }),
    };
  };

  try {
    await assert.rejects((async () => {
    const first = await saveRecommendation({
      admin, auth: verifiedAuth, mapsKey: 'maps-key',
      data: { placeId: 'springfield-a', recommendation: { ...validContent, title: 'First Springfield' } },
    });
    const second = await saveRecommendation({
      admin, auth: verifiedAuth, mapsKey: 'maps-key',
      data: { placeId: 'springfield-b', recommendation: { ...validContent, title: 'Second Springfield' } },
    });

    assert.notEqual(first.city.id, second.city.id);
    const claimId = destinationClaimId({ countryId: 'US', type: 'city', nameEn: 'Springfield' });
    assert.deepEqual(
      admin.documents.get(`system/runtime/destinationClaims/${claimId}`).entries,
      {
        [first.city.id]: { providerPlaceId: 'springfield-a' },
        [second.city.id]: { providerPlaceId: 'springfield-b' },
      }
    );
    })(), /not mapped to an approved PlanLi destination/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('legacy country reuse does not authorize an unknown destination', async () => {
  const admin = createFakeAdmin({
    'countries/ישראל': {
      name: 'ישראל',
      code: 'IL',
      region: 'Asia',
      currencyCode: 'ILS',
      status: 'active',
    },
  });
  const originalFetch = global.fetch;
  global.fetch = async (urlValue) => {
    const url = new URL(String(urlValue));
    assert.notEqual(url.hostname, 'api.restcountries.com');
    if (url.pathname.includes('/autocomplete/')) {
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          predictions: [{ place_id: 'jerusalem-place-id', structured_formatting: { main_text: 'ירושלים' } }],
        }),
      };
    }
    const requestedPlaceId = url.searchParams.get('place_id');
    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          place_id: requestedPlaceId,
          name: requestedPlaceId === 'venue-id' ? 'מוזיאון' : 'ירושלים',
          formatted_address: 'ירושלים, ישראל',
          address_components: [
            { long_name: 'ירושלים', types: ['locality'] },
            { long_name: 'ישראל', short_name: 'IL', types: ['country'] },
          ],
          geometry: { location: { lat: 31.77, lng: 35.21 } },
        },
      }),
    };
  };

  try {
    await assert.rejects((async () => {
    const result = await saveRecommendation({
      admin,
      auth: verifiedAuth,
      mapsKey: 'maps-secret',
      restCountriesKey: 'rest-secret',
      data: {
        placeId: 'venue-id',
        recommendation: validContent,
      },
    });

    assert.equal(result.country.id, 'ישראל');
    const cityId = stableDestinationId('ישראל', 'jerusalem-place-id');
    assert.equal(result.city.id, cityId);
    assert.equal(admin.documents.has('countries/IL'), false);
    assert.deepEqual(
      admin.documents.get(`countries/ישראל/destinations/${cityId}`).providerRefs.googlePlaceId,
      'jerusalem-place-id'
    );
    })(), /not mapped to an approved PlanLi destination/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('country policy alone does not promote an unknown locality to a destination', async () => {
  const admin = createFakeAdmin({
    'countries/ישראל': {
      name: 'ישראל',
      code: 'IL',
      region: 'Asia',
      currencyCode: 'ILS',
      status: 'active',
    },
    'countries/סוריה': {
      name: 'סוריה',
      code: 'SY',
      region: 'Asia',
      currencyCode: 'SYP',
      status: 'active',
    },
  });
  const originalFetch = global.fetch;
  global.fetch = async (urlValue) => {
    const url = new URL(String(urlValue));
    if (url.pathname.includes('/autocomplete/')) {
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          predictions: [{ place_id: 'ariel-city-place-id', structured_formatting: { main_text: 'אריאל' } }],
        }),
      };
    }
    if (url.pathname.includes('/geocode/')) {
      throw new Error('Israel policy must resolve before reverse geocoding.');
    }
    const requestedPlaceId = url.searchParams.get('place_id');
    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          place_id: requestedPlaceId,
          name:
            requestedPlaceId === 'ariel-venue-place-id'
              ? 'מסעדה באריאל'
              : 'אריאל',
          formatted_address: 'אריאל',
          address_components: [
            { long_name: 'אריאל', types: ['locality'] },
          ],
          geometry: { location: { lat: 32.1045, lng: 35.1741 } },
        },
      }),
    };
  };

  try {
    await assert.rejects((async () => {
    const preview = await resolveRecommendationDestination({
      admin,
      auth: verifiedAuth,
      mapsKey: 'maps-secret',
      restCountriesKey: 'rest-secret',
      data: { placeId: 'ariel-venue-place-id' },
    });
    assert.equal(preview.destination.country.id, 'ישראל');
    assert.equal(preview.destination.country.code, 'IL');
    assert.equal(preview.resolutionSource, 'independent-policy-registry');
    assert.equal(
      admin.documents.has(
        `countries/ישראל/destinations/${stableDestinationId('ישראל', 'ariel-city-place-id')}`
      ),
      false
    );

    const saved = await saveRecommendation({
      admin,
      auth: verifiedAuth,
      mapsKey: 'maps-secret',
      restCountriesKey: 'rest-secret',
      data: {
        placeId: 'ariel-venue-place-id',
        countryOverrideId: 'סוריה',
        recommendation: validContent,
      },
    });
    assert.equal(saved.country.id, preview.destination.country.id);
    assert.equal(saved.city.id, preview.destination.city.id);
    assert.equal(saved.resolutionSource, preview.resolutionSource);
    })(), /not mapped to an approved PlanLi destination/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Google errors and unknown country overrides are rejected', async () => {
  const admin = createFakeAdmin();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'ZERO_RESULTS' }),
  });

  try {
    await assert.rejects(
      saveRecommendation({
        admin,
        auth: verifiedAuth,
        mapsKey: 'secret-key',
        data: {
          placeId: 'bad-place',
          recommendation: validContent,
        },
      }),
      /selected place no longer exists/
    );
  } finally {
    global.fetch = originalFetch;
  }

  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: 'OK',
      result: {
        place_id: 'venue-google-id',
        name: 'Cafe',
        types: ['locality'],
        address_components: [
          { long_name: 'Tel Aviv', types: ['locality'] },
          { long_name: 'Israel', short_name: 'IL', types: ['country'] },
        ],
        geometry: { location: { lat: 32.08, lng: 34.78 } },
      },
    }),
  });
  try {
    await assert.rejects(
      saveRecommendation({
        admin,
        auth: verifiedAuth,
        mapsKey: 'secret-key',
        data: {
          placeId: 'venue-google-id',
          countryOverrideId: 'missing-country',
          recommendation: validContent,
        },
      }),
      /not mapped to an approved PlanLi destination/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
