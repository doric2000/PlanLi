const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { resolveCountryMetadata } = require('./countryMetadata');
const {
  getHebrewCountryName,
  normalizeCoordinates,
  resolveIsraelPolicy,
  resolveLocalCountry,
} = require('./countryGeography');

const MAX_RECOMMENDATION_IMAGES = 5;
const MAX_RECOMMENDATION_IMAGE_BYTES = 8 * 1024 * 1024;
const DESTINATION_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800';
const GOOGLE_REVERSE_GEOCODE_TIMEOUT_MS = 2500;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanString(value, { field, min = 0, max }) {
  assert(typeof value === 'string', 'invalid-argument', `${field} must be a string.`);
  const result = value.trim();
  assert(result.length >= min, 'invalid-argument', `${field} is too short.`);
  assert(result.length <= max, 'invalid-argument', `${field} is too long.`);
  return result;
}

function cleanOptionalString(value, { field, max }) {
  if (value == null || value === '') return '';
  return cleanString(value, { field, max });
}

function cleanStringArray(value, { field, maxItems, maxLength }) {
  assert(Array.isArray(value), 'invalid-argument', `${field} must be an array.`);
  assert(value.length <= maxItems, 'invalid-argument', `${field} contains too many items.`);
  return Array.from(
    new Set(
      value.map((entry) =>
        cleanString(entry, { field: `${field} item`, min: 1, max: maxLength })
      )
    )
  );
}

function sanitizeRecommendationContent(data) {
  assert(data && typeof data === 'object', 'invalid-argument', 'Missing recommendation data.');

  return {
    title: cleanString(data.title, { field: 'title', min: 1, max: 120 }),
    description: cleanString(data.description, {
      field: 'description',
      min: 1,
      max: 5000,
    }),
    category: cleanString(data.category, {
      field: 'category',
      min: 1,
      max: 80,
    }),
    categoryId: cleanString(data.categoryId, {
      field: 'categoryId',
      min: 1,
      max: 80,
    }),
    tags: cleanStringArray(data.tags || [], {
      field: 'tags',
      maxItems: 20,
      maxLength: 60,
    }),
    budget: cleanOptionalString(data.budget, { field: 'budget', max: 50 }),
  };
}

function isVerifiedCaller(auth) {
  if (!auth?.uid) return false;
  if (auth.token?.admin === true) return true;
  const provider = auth.token?.firebase?.sign_in_provider;
  return provider !== 'password' || auth.token?.email_verified === true;
}

function stableDocumentId(prefix, seed) {
  const normalizedPrefix = String(prefix || 'doc')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8) || 'doc';
  const normalizedSeed = String(seed || '').normalize('NFKC').trim();
  assert(normalizedSeed, 'invalid-argument', 'A stable document ID requires a seed.');
  const digest = crypto
    .createHash('sha256')
    .update(`${normalizedPrefix}:${normalizedSeed}`)
    .digest('base64url')
    .slice(0, 20);
  return `${normalizedPrefix}_${digest}`;
}

function parsePlaceDetails(result) {
  assert(result && typeof result === 'object', 'failed-precondition', 'Google Places returned no result.');
  const components = Array.isArray(result.address_components)
    ? result.address_components
    : [];
  const component = (...types) => {
    for (const type of types) {
      const found = components.find((entry) => entry.types?.includes(type));
      if (found) return found;
    }
    return null;
  };

  const country = component('country');
  const city = component(
    'locality',
    'postal_town',
    'administrative_area_level_3',
    'administrative_area_level_2',
    'administrative_area_level_1'
  );
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;

  return {
    placeId: result.place_id,
    name: result.name || city?.long_name || null,
    address: result.formatted_address || null,
    url: result.url || null,
    countryName: country?.long_name || null,
    countryCode: country?.short_name
      ? String(country.short_name).toUpperCase()
      : null,
    cityName: city?.long_name || result.name || null,
    coordinates:
      typeof lat === 'number' && typeof lng === 'number'
        ? { lat, lng }
        : null,
  };
}

async function fetchGooglePlace(placeId, mapsKey) {
  const normalizedPlaceId = cleanString(placeId, {
    field: 'placeId',
    min: 3,
    max: 300,
  });
  assert(mapsKey, 'failed-precondition', 'GOOGLE_MAPS_KEY is not configured.');

  const fields =
    'name,formatted_address,address_components,geometry,place_id,url,rating';
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', normalizedPlaceId);
  url.searchParams.set('fields', fields);
  url.searchParams.set('language', 'he');
  url.searchParams.set('key', mapsKey);

  const response = await fetch(url);
  assert(response.ok, 'unavailable', 'Google Places request failed.');
  const payload = await response.json();
  assert(payload?.status === 'OK' && payload?.result, 'invalid-argument', 'Invalid Google place.');
  return payload.result;
}

async function fetchGoogleCityPlace(parsedPlace, mapsKey) {
  const queryText = [parsedPlace.cityName, parsedPlace.countryName]
    .filter(Boolean)
    .join(' ');
  if (!queryText) return null;

  try {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/place/autocomplete/json'
    );
    url.searchParams.set('input', queryText);
    url.searchParams.set('types', '(cities)');
    url.searchParams.set('language', 'he');
    url.searchParams.set('key', mapsKey);
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const cityPlaceId = payload?.predictions?.[0]?.place_id;
    if (!cityPlaceId) return null;
    return fetchGooglePlace(cityPlaceId, mapsKey);
  } catch {
    return null;
  }
}

async function fetchGoogleReverseCountry(
  coordinates,
  mapsKey,
  {
    fetchImpl = global.fetch,
    timeoutMs = GOOGLE_REVERSE_GEOCODE_TIMEOUT_MS,
  } = {}
) {
  const normalized = normalizeCoordinates(coordinates);
  if (!normalized || !mapsKey || typeof fetchImpl !== 'function') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${normalized.lat},${normalized.lng}`);
    url.searchParams.set('result_type', 'country');
    url.searchParams.set('language', 'he');
    url.searchParams.set('key', mapsKey);
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.status !== 'OK' || !Array.isArray(payload.results)) return null;

    for (const result of payload.results) {
      const country = result?.address_components?.find((component) =>
        component.types?.includes('country')
      );
      const countryCode = String(country?.short_name || '').toUpperCase();
      if (/^[A-Z]{2}$/.test(countryCode)) {
        return {
          countryCode,
          countryName: country.long_name || getHebrewCountryName(countryCode),
          resolutionSource: 'google-reverse',
        };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function countryFromParsedPlace(parsed, resolutionSource) {
  const countryCode = String(parsed?.countryCode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    countryCode,
    countryName:
      parsed.countryName || getHebrewCountryName(countryCode),
    resolutionSource,
  };
}

async function resolvePlaceCountry({
  parsedPlace,
  parsedCity,
  mapsKey,
}) {
  const coordinates =
    normalizeCoordinates(parsedPlace?.coordinates) ||
    normalizeCoordinates(parsedCity?.coordinates);
  assert(
    coordinates,
    'failed-precondition',
    'Google Places returned no valid coordinates for this place.'
  );

  const israelPolicy = resolveIsraelPolicy(coordinates);
  if (israelPolicy) return israelPolicy;

  const placeCountry = countryFromParsedPlace(
    parsedPlace,
    'place-details'
  );
  if (placeCountry) return placeCountry;

  const cityCountry = countryFromParsedPlace(parsedCity, 'city-place');
  if (cityCountry) return cityCountry;

  const reverseCountry = await fetchGoogleReverseCountry(
    coordinates,
    mapsKey
  );
  if (reverseCountry) return reverseCountry;

  const localCountry = resolveLocalCountry(coordinates);
  assert(
    localCountry?.countryCode,
    'failed-precondition',
    'Could not resolve a trusted country for this place.'
  );
  return localCountry;
}

function buildDownloadUrl(bucketName, objectPath, metadata, fallbackUrl) {
  const tokens = String(metadata?.metadata?.firebaseStorageDownloadTokens || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (tokens[0]) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
      objectPath
    )}?alt=media&token=${encodeURIComponent(tokens[0])}`;
  }
  let parsedFallback = null;
  try {
    parsedFallback = new URL(fallbackUrl);
  } catch {
    parsedFallback = null;
  }
  const expectedPath = `/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}`;
  assert(
    parsedFallback?.protocol === 'https:' &&
      parsedFallback.hostname === 'firebasestorage.googleapis.com' &&
      parsedFallback.pathname === expectedPath &&
      parsedFallback.searchParams.get('alt') === 'media',
    'failed-precondition',
    'Uploaded image has no verified download URL.'
  );
  return fallbackUrl;
}

async function validateVariant({
  admin,
  uid,
  assetId,
  variant,
  expectedVariant,
  mediaBucket,
}) {
  assert(variant && typeof variant === 'object', 'invalid-argument', `Missing ${expectedVariant} image.`);
  const path = cleanString(variant.path, {
    field: `${expectedVariant}.path`,
    min: 1,
    max: 500,
  });
  assert(
    path === `media/${uid}/${assetId}/${expectedVariant}.webp`,
    'permission-denied',
    'Image path is outside the caller media folder.'
  );

  const bucket = admin.storage().bucket(mediaBucket);
  const file = bucket.file(path);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch {
    throw new HttpsError('failed-precondition', 'Uploaded image was not found.');
  }

  const size = Number(metadata.size || 0);
  assert(metadata.contentType === 'image/webp', 'invalid-argument', 'Prepared images must be WebP.');
  assert(
    Number.isFinite(size) && size > 0 && size <= MAX_RECOMMENDATION_IMAGE_BYTES,
    'invalid-argument',
    'Image is too large.'
  );
  assert(
    metadata.metadata?.ownerUid === uid,
    'permission-denied',
    'Image metadata owner does not match the caller.'
  );
  assert(
    metadata.metadata?.variant === expectedVariant,
    'invalid-argument',
    'Image variant metadata is invalid.'
  );
  assert(
    metadata.metadata?.assetId === assetId,
    'invalid-argument',
    'Image asset metadata is invalid.'
  );

  return {
    url: buildDownloadUrl(
      metadata.bucket || bucket.name,
      path,
      metadata,
      variant.url
    ),
    path,
    width: Number(metadata.metadata?.width) || null,
    height: Number(metadata.metadata?.height) || null,
    bytes: size,
    contentType: 'image/webp',
  };
}

async function validateMediaAssets({
  admin,
  uid,
  media,
  mediaBucket,
  maxAssets = MAX_RECOMMENDATION_IMAGES,
}) {
  const assets = Array.isArray(media) ? media : [];
  assert(
    assets.length <= maxAssets,
    'invalid-argument',
    `This item supports at most ${maxAssets} images.`
  );

  return Promise.all(
    assets.map(async (asset) => {
      assert(
        typeof asset?.assetId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            asset.assetId
          ),
        'invalid-argument',
        'Invalid media descriptor.'
      );

      const [large, feed, thumb] = await Promise.all([
        validateVariant({
          admin,
          uid,
          assetId: asset.assetId,
          variant: asset.large,
          expectedVariant: 'large',
          mediaBucket,
        }),
        validateVariant({
          admin,
          uid,
          assetId: asset.assetId,
          variant: asset.feed,
          expectedVariant: 'feed',
          mediaBucket,
        }),
        validateVariant({
          admin,
          uid,
          assetId: asset.assetId,
          variant: asset.thumb,
          expectedVariant: 'thumb',
          mediaBucket,
        }),
      ]);
      return {
        assetId: asset.assetId,
        aspectRatio:
          Number.isFinite(asset.aspectRatio) && asset.aspectRatio > 0
            ? asset.aspectRatio
            : large.width / Math.max(1, large.height),
        placeholder: {
          thumbhash:
            typeof asset?.placeholder?.thumbhash === 'string'
              ? asset.placeholder.thumbhash
              : null,
          color:
            typeof asset?.placeholder?.color === 'string'
              ? asset.placeholder.color
              : '#eeeeee',
        },
        large,
        feed,
        thumb,
      };
    })
  );
}

async function resolveExistingDestination(db, destinationRef) {
  assert(
    destinationRef &&
      typeof destinationRef.countryId === 'string' &&
      typeof destinationRef.cityId === 'string',
    'invalid-argument',
    'destinationRef is invalid.'
  );
  const countryId = cleanString(destinationRef.countryId, {
    field: 'countryId',
    min: 1,
    max: 180,
  });
  const cityId = cleanString(destinationRef.cityId, {
    field: 'cityId',
    min: 1,
    max: 180,
  });
  const countryRef = db.doc(`countries/${countryId}`);
  const cityRef = db.doc(`countries/${countryId}/cities/${cityId}`);
  const [countrySnap, citySnap] = await Promise.all([
    countryRef.get(),
    cityRef.get(),
  ]);
  assert(countrySnap.exists && citySnap.exists, 'not-found', 'Destination does not exist.');
  assert(
    countrySnap.data()?.status === 'active' && citySnap.data()?.status === 'active',
    'failed-precondition',
    'Destination is not active.'
  );
  return {
    countryRef,
    cityRef,
    countryId,
    cityId,
    countryData: countrySnap.data(),
    cityData: citySnap.data(),
    createCountry: false,
    createCity: false,
    place: null,
  };
}

async function resolveGoogleDestination({
  admin,
  placeId,
  countryOverrideId,
  mapsKey,
  restCountriesKey,
}) {
  const resolutionStartedAt = Date.now();
  const db = admin.firestore();
  const placeResult = await fetchGooglePlace(placeId, mapsKey);
  const parsed = parsePlaceDetails(placeResult);
  assert(parsed.cityName, 'failed-precondition', 'Could not derive a city from this place.');
  const cityPlaceResult = await fetchGoogleCityPlace(parsed, mapsKey);
  const parsedCity = cityPlaceResult
    ? parsePlaceDetails(cityPlaceResult)
    : parsed;
  const resolvedCountry = await resolvePlaceCountry({
    parsedPlace: parsed,
    parsedCity,
    mapsKey,
  });

  let countryId = null;
  let countryData = null;
  if (countryOverrideId && resolvedCountry.resolutionSource !== 'israel-policy') {
    const requestedOverrideId = cleanString(countryOverrideId, {
      field: 'countryOverrideId',
      min: 1,
      max: 180,
    });
    const overrideSnap = await db.doc(`countries/${requestedOverrideId}`).get();
    assert(overrideSnap.exists, 'invalid-argument', 'Country override does not exist.');
    const overrideData = overrideSnap.data();
    assert(
      String(overrideData?.code || '').toUpperCase() ===
        resolvedCountry.countryCode,
      'invalid-argument',
      'Country override does not match the resolved destination.'
    );
    countryId = requestedOverrideId;
    countryData = overrideData;
  }

  if (!countryId) {
    const existing = await db
      .collection('countries')
      .where('code', '==', resolvedCountry.countryCode)
      .limit(1)
      .get();
    if (!existing.empty) {
      countryId = existing.docs[0].id;
      countryData = existing.docs[0].data();
    }
  }

  if (!countryId) {
    const countryName =
      resolvedCountry.countryName ||
      getHebrewCountryName(resolvedCountry.countryCode);
    countryId = stableDocumentId('cty', resolvedCountry.countryCode);
    let metadata;
    try {
      metadata = await resolveCountryMetadata({
        countryCode: resolvedCountry.countryCode,
        apiKey: restCountriesKey,
      });
    } catch {
      throw new HttpsError(
        'failed-precondition',
        'Could not resolve trusted country metadata for this destination.'
      );
    }
    countryData = {
      name: countryName,
      code: resolvedCountry.countryCode,
      region: metadata.region,
      currencyCode: metadata.currencyCode,
      status: 'active',
    };
  }

  const cities = db.collection(`countries/${countryId}/cities`);
  let cityId = null;
  let cityData = null;
  const existingCity = await cities
    .where('providerIds.googlePlaceIds', 'array-contains', parsedCity.placeId)
    .limit(1)
    .get();
  if (!existingCity.empty) {
    cityId = existingCity.docs[0].id;
    cityData = existingCity.docs[0].data();
  }

  if (!cityId) {
    cityId = stableDocumentId('city', `${countryId}:${parsedCity.placeId}`);
    const namedCitySnapshot = await db
      .doc(`countries/${countryId}/cities/${cityId}`)
      .get();
    if (namedCitySnapshot.exists) {
      cityData = namedCitySnapshot.data();
    }
  }

  if (!cityData) {
    cityData = {
      name: parsedCity.cityName || parsed.cityName,
      description: parsedCity.address || parsed.address || '',
      providerIds: { googlePlaceIds: [parsedCity.placeId] },
      rating: Number(cityPlaceResult?.rating) || 0,
      travelers: 0,
      imageUrl: DESTINATION_FALLBACK_IMAGE,
      status: 'active',
      stats: { recommendationCount: 0 },
      ...(parsedCity.coordinates
        ? { coordinates: parsedCity.coordinates }
        : {}),
    };
  }

  const destination = {
    countryRef: db.doc(`countries/${countryId}`),
    cityRef: db.doc(`countries/${countryId}/cities/${cityId}`),
    countryId,
    cityId,
    countryData,
    cityData,
    createCountry: !(await db.doc(`countries/${countryId}`).get()).exists,
    createCity: !(await db.doc(`countries/${countryId}/cities/${cityId}`).get()).exists,
    place: {
      placeId: parsed.placeId,
      name: parsed.name,
      address: parsed.address,
      url: parsed.url,
      ...(parsed.coordinates ? { coordinates: parsed.coordinates } : {}),
    },
    resolutionSource: resolvedCountry.resolutionSource,
  };
  console.info('Recommendation destination country resolved.', {
    resolutionSource: destination.resolutionSource,
    countryCode: resolvedCountry.countryCode,
    durationMs: Date.now() - resolutionStartedAt,
  });
  return destination;
}

async function resolveRecommendationDestination({
  admin,
  auth,
  data,
  mapsKey,
  restCountriesKey,
}) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(
    isVerifiedCaller(auth),
    'permission-denied',
    'Email verification is required.'
  );
  const destination = await resolveGoogleDestination({
    admin,
    placeId: data?.placeId,
    mapsKey,
    restCountriesKey,
  });
  return {
    place: destination.place,
    destination: {
      country: {
        id: destination.countryId,
        name: destination.countryData.name || destination.countryId,
        code: destination.countryData.code || null,
      },
      city: {
        id: destination.cityId,
        name: destination.cityData.name || destination.cityId,
        googlePlaceId:
          destination.cityData.providerIds?.googlePlaceIds?.[0] || null,
        description: destination.cityData.description || '',
        ...(destination.cityData.coordinates
          ? { coordinates: destination.cityData.coordinates }
          : {}),
      },
    },
    persisted: !destination.createCountry && !destination.createCity,
    resolutionSource: destination.resolutionSource,
  };
}

async function saveRecommendation({
  admin,
  auth,
  data,
  mapsKey,
  restCountriesKey,
  mediaBucket,
}) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'Email verification is required.');
  if (Array.isArray(data?.recommendation?.media) && data.recommendation.media.length) {
    assert(mediaBucket, 'failed-precondition', 'MEDIA_STORAGE_BUCKET is not configured.');
  }
  const uid = auth.uid;
  const db = admin.firestore();
  const recommendationId =
    typeof data?.recommendationId === 'string' && data.recommendationId.trim()
      ? data.recommendationId.trim()
      : null;
  const recommendationRef = recommendationId
    ? db.doc(`recommendations/${recommendationId}`)
    : db.collection('recommendations').doc();
  const previousSnap = recommendationId ? await recommendationRef.get() : null;
  const previousData = previousSnap?.exists ? previousSnap.data() : null;

  if (recommendationId) {
    assert(previousSnap.exists, 'not-found', 'Recommendation does not exist.');
    assert(
      previousData.ownerId === uid || auth.token?.admin === true,
      'permission-denied',
      'You do not own this recommendation.'
    );
  }

  const content = sanitizeRecommendationContent(data?.recommendation);
  const media = await validateMediaAssets({
    admin,
    uid,
    media: data?.recommendation?.media,
    mediaBucket,
  });
  const destination = data?.destinationRef
    ? await resolveExistingDestination(db, data.destinationRef)
    : await resolveGoogleDestination({
        admin,
        placeId: data?.placeId,
        countryOverrideId: data?.countryOverrideId,
        mapsKey,
        restCountriesKey,
      });

  const payload = {
    ...content,
    status: 'active',
    destination: {
      countryId: destination.countryId,
      cityId: destination.cityId,
      countryName: destination.countryData.name || destination.countryId,
      cityName: destination.cityData.name || destination.cityId,
    },
    media,
    place: destination.place,
  };

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(recommendationRef);
    const currentData = current.exists ? current.data() : null;
    const previousCountryId = currentData?.destination?.countryId;
    const previousCityId = currentData?.destination?.cityId;
    const previousCityRef = previousCountryId && previousCityId
      ? db.doc(`countries/${previousCountryId}/cities/${previousCityId}`)
      : null;
    const destinationChanged =
      !currentData || previousCityRef?.path !== destination.cityRef.path;
    const [countrySnapshot, citySnapshot, previousCitySnapshot] = await Promise.all([
      transaction.get(destination.countryRef),
      transaction.get(destination.cityRef),
      previousCityRef && previousCityRef.path !== destination.cityRef.path
        ? transaction.get(previousCityRef)
        : Promise.resolve(null),
    ]);
    if (recommendationId) {
      assert(current.exists, 'not-found', 'Recommendation no longer exists.');
      assert(
        currentData.ownerId === uid || auth.token?.admin === true,
        'permission-denied',
        'Recommendation ownership changed.'
      );
    } else {
      assert(!current.exists, 'already-exists', 'Recommendation already exists.');
    }

    if (!countrySnapshot.exists) {
      assert(
        destination.createCountry,
        'not-found',
        'The selected existing country no longer exists.'
      );
      transaction.create(destination.countryRef, {
        ...destination.countryData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (!citySnapshot.exists) {
      assert(
        destination.createCity,
        'not-found',
        'The selected existing city no longer exists.'
      );
      transaction.create(destination.cityRef, {
        ...destination.cityData,
        stats: {
          ...(destination.cityData.stats || {}),
          recommendationCount: destinationChanged ? 1 : 0,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (destinationChanged) {
      transaction.update(destination.cityRef, {
        'stats.recommendationCount': Math.max(
          0,
          Number(citySnapshot.data()?.stats?.recommendationCount || 0) + 1
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (previousCitySnapshot?.exists) {
      transaction.update(previousCityRef, {
        'stats.recommendationCount': Math.max(
          0,
          Number(previousCitySnapshot.data()?.stats?.recommendationCount || 0) - 1
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (recommendationId) {
      transaction.update(recommendationRef, {
        ...payload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      transaction.create(recommendationRef, {
        ...payload,
        ownerId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        stats: { likeCount: 0, commentCount: 0 },
      });
    }
  });

  return {
    recommendationId: recommendationRef.id,
    country: {
      id: destination.countryId,
      name: destination.countryData.name || destination.countryId,
    },
    city: {
      id: destination.cityId,
      name: destination.cityData.name || destination.cityId,
    },
    ...(destination.resolutionSource
      ? { resolutionSource: destination.resolutionSource }
      : {}),
  };
}

module.exports = {
  MAX_RECOMMENDATION_IMAGES,
  MAX_RECOMMENDATION_IMAGE_BYTES,
  isVerifiedCaller,
  parsePlaceDetails,
  fetchGoogleReverseCountry,
  resolvePlaceCountry,
  resolveRecommendationDestination,
  sanitizeRecommendationContent,
  saveRecommendation,
  stableDocumentId,
  validateMediaAssets,
};
