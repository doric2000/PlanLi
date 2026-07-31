const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchGoogleReverseCountry,
  isVerifiedCaller,
  legacyDestinationId,
  parsePlaceDetails,
  resolvePlaceCountry,
  resolveRecommendationDestination,
  sanitizeRecommendationContent,
  saveRecommendation,
  stableDocumentId,
  validateMediaAssets,
} = require('./recommendationService');

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

test('recommendation content ignores client-controlled ownership and location fields', () => {
  const result = sanitizeRecommendationContent({
    title: '  Good place ',
    description: 'A useful description',
    category: 'Food',
    categoryId: 'food',
    tags: ['pizza', 'pizza', 'family'],
    budget: '$$',
    userId: 'spoofed',
    countryId: 'spoofed',
    likes: 900,
  });

  assert.deepEqual(result, {
    title: 'Good place',
    description: 'A useful description',
    category: 'Food',
    categoryId: 'food',
    tags: ['pizza', 'family'],
    budget: '$$',
  });
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
      coordinates: { lat: 32.1045, lng: 35.1741 },
    },
    parsedCity: null,
    mapsKey: 'unused',
  });
  assert.equal(result.countryCode, 'IL');
  assert.equal(result.countryName, 'ישראל');
  assert.equal(result.resolutionSource, 'israel-policy');
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

test('country resolution falls back through Google reverse and local boundaries', async () => {
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
      parsedPlace: { coordinates: { lat: 48.8566, lng: 2.3522 } },
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
  assert.equal(stableDocumentId('  New York/USA  '), 'New-York-USA');
  assert.equal(stableDocumentId('New York/USA'), 'New-York-USA');
  assert.equal(legacyDestinationId('  מיאנמר (בורמה)  '), 'מיאנמר (בורמה)');
  assert.equal(legacyDestinationId('City/Area'), 'City-Area');
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
  const metadata = (variant, ownerUid = 'u1') => ({
    size: '1024',
    contentType: 'image/webp',
    metadata: {
      ownerUid,
      assetId,
      variant,
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

function createFakeAdmin(seed = {}) {
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
  });
  const makeQuery = (collectionPath, field, expected) => ({
    limit: () => makeQuery(collectionPath, field, expected),
    get: async () => {
      const prefix = `${collectionPath}/`;
      const matches = [...documents.entries()]
        .filter(([documentPath, data]) => {
          const remainder = documentPath.slice(prefix.length);
          return (
            documentPath.startsWith(prefix) &&
            !remainder.includes('/') &&
            data?.[field] === expected
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
        assert.equal(operation, '==');
        return makeQuery(collectionPath, field, expected);
      },
    }),
    runTransaction: async (callback) =>
      callback({
        get: async (ref) => snapshot(ref),
        create: (ref, data) => {
          if (documents.has(ref.path)) throw new Error('already exists');
          documents.set(ref.path, data);
        },
        update: (ref, data) => {
          if (!documents.has(ref.path)) throw new Error('missing');
          documents.set(ref.path, { ...documents.get(ref.path), ...data });
        },
      }),
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
  title: 'Server saved',
  description: 'A valid recommendation',
  category: 'Food',
  categoryId: 'food',
  tags: [],
  budget: '$$',
  media: [],
};

test('saveRecommendation creates against an existing destination and owns server fields', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL' },
    'countries/IL/cities/TLV': { name: 'Tel Aviv', googlePlaceId: 'city-1' },
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
  assert.equal(saved.userId, 'owner');
  assert.equal(saved.likes, 0);
  assert.deepEqual(saved.likedBy, []);
  assert.equal(saved.countryId, 'IL');
  assert.equal(saved.createdAt, 'SERVER_TIMESTAMP');
});

test('saveRecommendation rejects unverified and foreign edits', async () => {
  const admin = createFakeAdmin({
    'countries/IL': { name: 'Israel', code: 'IL' },
    'countries/IL/cities/TLV': { name: 'Tel Aviv' },
    'recommendations/foreign': {
      userId: 'someone-else',
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

test('Google place is reloaded by the server and creates legacy-compatible destination docs', async () => {
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
          predictions: [{ place_id: 'city-google-id' }],
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
          name: requestedPlaceId === 'venue-google-id' ? 'Cafe' : 'Tel Aviv',
          formatted_address: 'Tel Aviv, Israel',
          address_components: [
            { long_name: 'Tel Aviv', short_name: 'Tel Aviv', types: ['locality'] },
            { long_name: 'Israel', short_name: 'IL', types: ['country'] },
          ],
          geometry: { location: { lat: 32.08, lng: 34.78 } },
        },
      }),
    };
  };

  try {
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

    assert.equal(result.country.id, 'Israel');
    assert.equal(result.city.id, 'Tel Aviv');
    assert.equal(admin.documents.get('countries/Israel').code, 'IL');
    assert.deepEqual(
      Object.keys(admin.documents.get('countries/Israel')).sort(),
      ['code', 'currencyCode', 'name', 'region']
    );
    assert.equal(
      admin.documents.get('countries/Israel/cities/Tel Aviv').googlePlaceId,
      'city-google-id'
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        admin.documents.get('countries/Israel/cities/Tel Aviv'),
        'createdBy'
      ),
      false
    );
    assert.equal(
      admin.documents.get(`recommendations/${result.recommendationId}`).place.placeId,
      'venue-google-id'
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('Google place reuses a legacy country document by ISO code', async () => {
  const admin = createFakeAdmin({
    'countries/ישראל': {
      name: 'ישראל',
      code: 'IL',
      region: 'Asia',
      currencyCode: 'ILS',
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
          predictions: [{ place_id: 'jerusalem-place-id' }],
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
    assert.equal(result.city.id, 'ירושלים');
    assert.equal(admin.documents.has('countries/IL'), false);
    assert.equal(
      admin.documents.get('countries/ישראל/cities/ירושלים').googlePlaceId,
      'jerusalem-place-id'
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('Ariel preview and save use the same Israel destination without a country component', async () => {
  const admin = createFakeAdmin({
    'countries/ישראל': {
      name: 'ישראל',
      code: 'IL',
      region: 'Asia',
      currencyCode: 'ILS',
    },
    'countries/סוריה': {
      name: 'סוריה',
      code: 'SY',
      region: 'Asia',
      currencyCode: 'SYP',
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
          predictions: [{ place_id: 'ariel-city-place-id' }],
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
    const preview = await resolveRecommendationDestination({
      admin,
      auth: verifiedAuth,
      mapsKey: 'maps-secret',
      restCountriesKey: 'rest-secret',
      data: { placeId: 'ariel-venue-place-id' },
    });
    assert.equal(preview.destination.country.id, 'ישראל');
    assert.equal(preview.destination.country.code, 'IL');
    assert.equal(preview.resolutionSource, 'israel-policy');
    assert.equal(
      admin.documents.has('countries/ישראל/cities/אריאל'),
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
      /Invalid Google place/
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
      /override does not exist/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
