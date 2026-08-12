const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { resolveCountryMetadata } = require('./countryMetadata');
const {
  getHebrewCountryName,
  normalizeCoordinates,
  resolveLocalCountry,
} = require('./countryGeography');
const { resolveDestinationCountryPolicy } = require('./destinationGeopoliticalPolicy');
const {
  analyzeTagValues,
  buildRecommendationFacets,
  categoryFromLegacyClassification,
  ENVIRONMENT_IDS,
  getCategoryLabel,
  INTEREST_IDS,
  NEED_IDS,
  normalizeBudget,
  normalizeCategoryId,
  POST_BUDGET_IDS,
  recommendationAttributeRequirements,
  SEASON_IDS,
  tagsMatchCategory,
  taxonomy,
  TRAVEL_PARTY_IDS,
  TRAVELER_STYLE_IDS,
  VIBE_IDS,
} = require('./travelTaxonomy');
const { buildSearchIndex } = require('./discoverySearch');
const { buildMapLocation } = require('./mapLocation');
const { consumeProviderBudget } = require('./providerRateLimitService');
const {
  googleCacheFor,
  isAreaDestination,
} = require('./legacyPlacesAdapter');
const {
  fetchBilingualPlace,
  fetchLocalityPlaceId,
} = require('./placesProviderAdapter');
const {
  buildDestinationV3,
  candidateMatchesLocality,
  destinationClaimId,
} = require('./destinationV3Service');
const {
  readResolvedPlaceToken,
  storeResolvedPlaceDestination,
} = require('./placesGatewayService');

const MAX_RECOMMENDATION_IMAGES = 5;
const MAX_RECOMMENDATION_IMAGE_BYTES = 8 * 1024 * 1024;
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
  const strict = Number(data.taxonomyVersion || 0) >= 4;

  const rawTags = cleanStringArray(data.tags || [], {
    field: 'tags',
    maxItems: 20,
    maxLength: 60,
  });
  const tagAnalysis = analyzeTagValues(rawTags);
  assert(tagAnalysis.recognized, 'invalid-argument', 'tags contain unsupported values.');
  const categoryId = categoryFromLegacyClassification(data.categoryId || data.category, rawTags);
  assert(categoryId, 'invalid-argument', 'categoryId is invalid.');
  assert(tagsMatchCategory(rawTags, categoryId), 'invalid-argument', 'tags do not match categoryId.');
  assert(!strict || tagAnalysis.tagIds.length >= 1,
    'invalid-argument', 'Choose at least one subcategory.');
  const rawBudget = cleanOptionalString(data.budget, { field: 'budget', max: 50 });
  const budget = normalizeBudget(rawBudget, { allowFlexible: false }) || tagAnalysis.budgetLevel;
  assert(!rawBudget || budget, 'invalid-argument', 'budget is invalid.');
  assert(!budget || POST_BUDGET_IDS.includes(budget), 'invalid-argument', 'budget is invalid.');
  assert(!strict || budget, 'invalid-argument', 'budget is required.');

  return {
    title: cleanString(data.title, { field: 'title', min: 1, max: 120 }),
    description: cleanString(data.description, {
      field: 'description',
      min: 1,
      max: 5000,
    }),
    category: getCategoryLabel(categoryId),
    categoryId,
    tags: tagAnalysis.tagIds,
    budget,
  };
}

function sanitizeSubmittedFacets(value) {
  if (value == null) return {};
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'facets are invalid.');
  const allowedFields = ['interests', 'audiences', 'vibes', 'travelerStyles', 'needs', 'seasons', 'environments'];
  assert(Object.keys(value).every((key) => allowedFields.includes(key)),
    'invalid-argument', 'facets contain unsupported fields.');
  const validate = (field, allowed, maximum, minimumWhenProvided = 0) => {
    const entries = value[field] || [];
    const provided = Object.prototype.hasOwnProperty.call(value, field);
    assert(Array.isArray(entries) && entries.length <= maximum &&
      (!provided || entries.length >= minimumWhenProvided),
      'invalid-argument', `${field} facets are invalid.`);
    assert(entries.every((entry) => typeof entry === 'string' && allowed.includes(entry)),
      'invalid-argument', `${field} facets are invalid.`);
    return Array.from(new Set(entries));
  };
  return {
    interests: validate('interests', INTEREST_IDS, 5, 1),
    audiences: validate('audiences', TRAVEL_PARTY_IDS, 4),
    vibes: validate('vibes', VIBE_IDS, 3),
    travelerStyles: validate('travelerStyles', TRAVELER_STYLE_IDS, 4),
    needs: validate('needs', NEED_IDS, NEED_IDS.length),
    seasons: validate('seasons', SEASON_IDS, SEASON_IDS.length),
    environments: validate('environments', ENVIRONMENT_IDS, ENVIRONMENT_IDS.length),
  };
}

function sanitizeRecommendationAttributes(value, content, { legacyFacets = null, taxonomyVersion = 0 } = {}) {
  const strict = Number(taxonomyVersion || 0) >= 4;
  const source = value == null ? legacyFacets : value;
  const legacy = value == null;
  if (source == null) {
    assert(!strict, 'invalid-argument', 'attributes are required.');
    return {
      audienceScope: 'selected', audiences: [], vibes: [], environments: [], needs: [],
    };
  }
  assert(source && typeof source === 'object' && !Array.isArray(source),
    'invalid-argument', 'attributes are invalid.');
  const allowedFields = legacy
    ? ['interests', 'audiences', 'vibes', 'travelerStyles', 'needs', 'seasons', 'environments']
    : ['audienceScope', 'audiences', 'vibes', 'environment', 'needs', 'needsConfirmed'];
  assert(Object.keys(source).every((key) => allowedFields.includes(key)),
    'invalid-argument', 'attributes contain unsupported fields.');

  const cleanValues = (field, allowed, maximum) => {
    const entries = source[field] || [];
    assert(Array.isArray(entries) && entries.length <= maximum &&
      entries.every((entry) => typeof entry === 'string' && allowed.includes(entry)),
    'invalid-argument', `${field} attributes are invalid.`);
    return Array.from(new Set(entries));
  };
  const audiences = cleanValues('audiences', TRAVEL_PARTY_IDS, legacy ? 6 : 4);
  const vibes = cleanValues('vibes', VIBE_IDS, 3);
  const needs = cleanValues('needs', NEED_IDS, NEED_IDS.length);
  const legacyEnvironments = legacy
    ? cleanValues('environments', ENVIRONMENT_IDS, ENVIRONMENT_IDS.length)
    : [];
  const environment = legacy
    ? (legacyEnvironments.length > 1 ? 'mixed' : legacyEnvironments[0] || '')
    : cleanOptionalString(source.environment, { field: 'environment', max: 40 });
  assert(!environment || ENVIRONMENT_IDS.includes(environment),
    'invalid-argument', 'environment attributes are invalid.');
  const audienceScope = legacy
    ? (audiences.length ? 'selected' : 'all')
    : source.audienceScope;
  assert(['all', 'selected'].includes(audienceScope),
    'invalid-argument', 'audienceScope is invalid.');
  assert(audienceScope !== 'all' || audiences.length === 0,
    'invalid-argument', 'Universal recommendations cannot select audiences.');
  assert(!strict || audienceScope === 'all' || audiences.length >= 1,
    'invalid-argument', 'Choose an audience or mark the recommendation for everyone.');

  const requirements = recommendationAttributeRequirements(content.tags);
  if (strict) {
    assert(!requirements.vibes || vibes.length >= 1,
      'invalid-argument', 'Choose at least one vibe for this recommendation.');
	assert(requirements.vibes || !vibes.length,
	  'invalid-argument', 'Vibe is not applicable to this recommendation.');
    assert(!requirements.environment || environment,
      'invalid-argument', 'Choose an environment for this recommendation.');
    assert(requirements.environment || !environment,
      'invalid-argument', 'Environment is not applicable to this recommendation.');
    assert(needs.every((needId) => requirements.needs.includes(needId)),
      'invalid-argument', 'A selected practical need is not applicable to this recommendation.');
    assert(!needs.length || source.needsConfirmed === true,
      'invalid-argument', 'Practical needs require explicit confirmation.');
  }

  return {
    audienceScope,
    audiences,
    vibes,
    environments: environment ? [environment] : [],
    needs,
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

function normalizePublishRequestId(value) {
  if (value == null || value === '') return null;
  const normalized = cleanString(value, {
    field: 'publishRequestId',
    min: 36,
    max: 36,
  });
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized),
    'invalid-argument',
    'publishRequestId is invalid.'
  );
  return normalized.toLowerCase();
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

function parseResolvedBilingualPlace(bilingual) {
  const place = bilingual?.he || {};
  const english = bilingual?.en || {};
  return {
    placeId: place.placeId,
    name: place.displayName || place.localityName || null,
    address: place.address || null,
    url: place.url || null,
    countryName: place.countryName || null,
    countryCode: place.countryCode || null,
    cityName: place.localityName || place.displayName || null,
    englishName: english.displayName || english.localityName || null,
    englishCityName: english.localityName || english.displayName || null,
    englishCountryName: english.countryName || null,
    coordinates: place.coordinates || bilingual?.en?.coordinates || null,
  };
}

function localityNamesForPlace(place) {
  return Array.from(new Set([
    ...(Array.isArray(place?.localityCandidates) ? place.localityCandidates : []),
    place?.localityName,
  ].map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 5);
}

async function fetchGooglePlace(placeId, mapsKey) {
  const normalizedPlaceId = cleanString(placeId, {
    field: 'placeId',
    min: 3,
    max: 300,
  });
  assert(mapsKey, 'failed-precondition', 'GOOGLE_MAPS_KEY is not configured.');

  const fields =
    'name,formatted_address,address_components,geometry,place_id,url';
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

  const independentPolicy = resolveDestinationCountryPolicy({
    placeId: parsedCity?.placeId || parsedPlace?.placeId,
    names: {
      he: parsedCity?.cityName || parsedPlace?.cityName || parsedPlace?.name,
      en: parsedCity?.englishCityName || parsedPlace?.englishCityName || parsedPlace?.englishName,
    },
  });
  if (independentPolicy) {
    return {
      ...independentPolicy,
      countryName: getHebrewCountryName(independentPolicy.countryCode),
    };
  }

  const placeCountry = countryFromParsedPlace(
    parsedPlace,
    'place-details'
  );
  if (placeCountry) return placeCountry;

  const cityCountry = countryFromParsedPlace(parsedCity, 'city-place');
  if (cityCountry) return cityCountry;

  const localCountry = resolveLocalCountry(coordinates);
  if (localCountry?.countryCode && localCountry.resolutionSource === 'local-boundary') {
    return localCountry;
  }

  const reverseCountry = await fetchGoogleReverseCountry(coordinates, mapsKey);
  if (reverseCountry && !(reverseCountry.countryCode === 'IL' && localCountry?.countryCode === 'PS')) {
    return reverseCountry;
  }
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
  existingMedia = [],
}) {
  const assets = Array.isArray(media) ? media : [];
  const trustedExistingAssets = Array.isArray(existingMedia) ? existingMedia : [];
  assert(
    assets.length <= maxAssets,
    'invalid-argument',
    `This item supports at most ${maxAssets} images.`
  );

  return Promise.all(
    assets.map(async (asset) => {
      const trustedExistingAsset = trustedExistingAssets.find((existingAsset) => {
        if (!existingAsset || existingAsset.assetId !== asset?.assetId) return false;
        return ['large', 'feed', 'thumb'].every((variantName) => {
          const existingVariant = existingAsset?.[variantName];
          const requestedVariant = asset?.[variantName];
          if (typeof existingVariant?.path === 'string' && existingVariant.path) {
            return requestedVariant?.path === existingVariant.path;
          }
          return (
            typeof existingVariant?.url === 'string' &&
            existingVariant.url &&
            requestedVariant?.url === existingVariant.url
          );
        });
      });
      if (trustedExistingAsset) return trustedExistingAsset;

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
  const cityRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
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
  resolvedPlace,
  countryOverrideId,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
}) {
  const resolutionStartedAt = Date.now();
  const db = admin.firestore();
  const bilingual = resolvedPlace || await fetchBilingualPlace({
    provider: placesProvider, placeId, mapsKey, newPlacesKey,
  });
  const parsed = parseResolvedBilingualPlace(bilingual);
  const selectedEn = bilingual.en || {};
  const selectedIsDestination = isAreaDestination(selectedEn) ||
    (selectedEn.types || []).some((type) => ['locality', 'postal_town', 'administrative_area_level_3'].includes(type));
  let destinationBilingual = bilingual;
  if (!selectedIsDestination) {
    const localityCandidates = localityNamesForPlace(selectedEn);
    const localityPlaceId = await fetchLocalityPlaceId({
      provider: placesProvider,
      localityName: selectedEn.localityName,
      localityCandidates,
      countryName: selectedEn.countryName,
      countryCode: selectedEn.countryCode || bilingual.he?.countryCode,
      coordinates: selectedEn.coordinates || bilingual.he?.coordinates,
      mapsKey,
      newPlacesKey,
    });
    assert(localityPlaceId, 'failed-precondition', 'Could not derive a trustworthy destination from this place.');
    destinationBilingual = await fetchBilingualPlace({
      provider: placesProvider, placeId: localityPlaceId, mapsKey, newPlacesKey,
    });
    const localityCandidate = {
      placeId: localityPlaceId,
      countryCode: destinationBilingual.en?.countryCode,
      nameEn: destinationBilingual.en?.localityName || destinationBilingual.en?.displayName,
      coordinates: destinationBilingual.en?.coordinates || destinationBilingual.he?.coordinates,
    };
    const validatedLocality = localityCandidates.some((localityName) => candidateMatchesLocality(
      localityCandidate,
      {
        countryCode: selectedEn.countryCode || bilingual.he?.countryCode,
        localityName,
        coordinates: selectedEn.coordinates || bilingual.he?.coordinates,
      }
    ));
    assert(validatedLocality, 'failed-precondition', 'The containing destination could not be validated. Please select a more specific place.');
  }
  const parsedCity = parseResolvedBilingualPlace(destinationBilingual);
  const resolvedCountry = await resolvePlaceCountry({
    parsedPlace: parsed,
    parsedCity,
    mapsKey,
  });

  let countryId = null;
  let countryData = null;
  if (countryOverrideId && resolvedCountry.resolutionSource !== 'independent-policy-registry') {
    const requestedOverrideId = cleanString(countryOverrideId, {
      field: 'countryOverrideId',
      min: 1,
      max: 180,
    });
    const overrideSnap = await db.doc(`countries/${requestedOverrideId}`).get();
    assert(overrideSnap.exists, 'invalid-argument', 'Country override does not exist.');
    const overrideData = overrideSnap.data();
    assert(
      overrideData?.status === 'active',
      'failed-precondition',
      'Country override is not active.'
    );
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
      .limit(5)
      .get();
    if (!existing.empty) {
      const activeCountry = existing.docs.find((document) => document.data()?.status === 'active');
      assert(
        activeCountry,
        'failed-precondition',
        'The matching country is not active.'
      );
      countryId = activeCountry.id;
      countryData = activeCountry.data();
    }
  }

  if (!countryId) {
    const countryName = getHebrewCountryName(resolvedCountry.countryCode);
    const countryNameEn = new Intl.DisplayNames(['en'], { type: 'region' })
      .of(resolvedCountry.countryCode) || resolvedCountry.countryCode;
    countryId = resolvedCountry.countryCode;
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
      names: { he: countryName, en: countryNameEn },
      code: resolvedCountry.countryCode,
      region: metadata.region,
      currencyCode: metadata.currencyCode,
      status: 'active',
    };
  }

  const destinations = db.collection(`countries/${countryId}/destinations`);
  let cityId = null;
  let cityData = null;
  destinationBilingual = {
    ...destinationBilingual,
    he: { ...destinationBilingual.he, countryCode: resolvedCountry.countryCode },
    en: { ...destinationBilingual.en, countryCode: resolvedCountry.countryCode },
  };
  const builtDestination = buildDestinationV3({
    countryId,
    he: destinationBilingual.he,
    en: destinationBilingual.en,
    fetchedAt: bilingual.fetchedAt instanceof Date ? bilingual.fetchedAt : new Date(),
  });
  const claimId = destinationClaimId({
    countryId,
    type: builtDestination.data.destinationType,
    nameEn: builtDestination.data.googleCache.names.en,
  });
  const claimRef = db.doc(`system/runtime/destinationClaims/${claimId}`);
  const claimData = {
    countryId,
    destinationType: builtDestination.data.destinationType,
    nameEn: builtDestination.data.googleCache.names.en,
    entries: {
      [builtDestination.id]: { providerPlaceId: parsedCity.placeId },
    },
  };
  let existingCity = await destinations
    .where('providerRefs.googlePlaceId', '==', parsedCity.placeId)
    .limit(1)
    .get();
  if (!existingCity.empty) {
    cityId = existingCity.docs[0].id;
    cityData = existingCity.docs[0].data();
    assert(
      cityData?.status === 'active',
      'failed-precondition',
      'The matching destination is not active.'
    );
  }

  if (!cityId) {
    const claimSnapshot = await claimRef.get();
    if (claimSnapshot.exists) {
      const claimed = claimSnapshot.data() || {};
      assert(
        claimed.countryId === countryId &&
          claimed.destinationType === builtDestination.data.destinationType,
        'failed-precondition',
        'The destination identity claim is inconsistent. Please try again later.'
      );
      const claimedEntry = Object.entries(claimed.entries || {})
        .find(([, entry]) => entry?.providerPlaceId === parsedCity.placeId);
      const claimedDestinationId = claimedEntry?.[0] ||
        (claimed.providerPlaceId === parsedCity.placeId ? claimed.destinationId : null);
      if (claimedDestinationId) {
        const claimedCitySnapshot = await db
          .doc(`countries/${countryId}/destinations/${claimedDestinationId}`)
          .get();
        assert(
          claimedCitySnapshot.exists && claimedCitySnapshot.data()?.status === 'active',
          'failed-precondition',
          'The matching destination is not active.'
        );
        cityId = claimedDestinationId;
        cityData = claimedCitySnapshot.data();
      }
    }
  }

  if (!cityId) {
    // Two legitimate same-name destinations in one country remain distinct.
    // Their shared claim records both stable Place-ID identities transactionally.
    cityId = builtDestination.id;
    const namedCitySnapshot = await db
      .doc(`countries/${countryId}/destinations/${cityId}`)
      .get();
    if (namedCitySnapshot.exists) {
      cityData = namedCitySnapshot.data();
      assert(
        cityData?.status === 'active',
        'failed-precondition',
        'The matching destination is not active.'
      );
    }
  }

  if (!cityData) {
    cityData = builtDestination.data;
  }

  const destination = {
    countryRef: db.doc(`countries/${countryId}`),
    cityRef: db.doc(`countries/${countryId}/destinations/${cityId}`),
    countryId,
    cityId,
    countryData,
    cityData,
    claimId,
    claimRef,
    claimData: {
      ...claimData,
      entries: { [cityId]: { providerPlaceId: parsedCity.placeId } },
    },
    createCountry: !(await db.doc(`countries/${countryId}`).get()).exists,
    createCity: !(await db.doc(`countries/${countryId}/destinations/${cityId}`).get()).exists,
    place: exactPlaceFromBilingual(
      bilingual,
      bilingual.fetchedAt instanceof Date ? bilingual.fetchedAt : new Date()
    ),
    resolutionSource: resolvedCountry.resolutionSource,
  };
  console.info('Recommendation destination country resolved.', {
    resolutionSource: destination.resolutionSource,
    countryCode: resolvedCountry.countryCode,
    durationMs: Date.now() - resolutionStartedAt,
  });
  return destination;
}

function exactPlaceFromBilingual(bilingual, fetchedAt = new Date()) {
  const he = bilingual?.he || {};
  const en = bilingual?.en || {};
  return {
    placeId: he.placeId || en.placeId,
    name: he.displayName || en.displayName || null,
    address: he.address || en.address || null,
    coordinates: he.coordinates || en.coordinates || null,
    types: Array.from(new Set([...(he.types || []), ...(en.types || [])])),
    googleCache: {
      ...googleCacheFor({ he, en, fetchedAt }),
      addresses: { he: he.address || '', en: en.address || '' },
    },
  };
}

function serializeDestinationResolution(destination) {
  return {
    countryId: destination.countryId,
    cityId: destination.cityId,
    countryData: destination.countryData,
    cityData: destination.cityData,
    claimId: destination.claimId || null,
    claimData: destination.claimData || null,
    createCountry: destination.createCountry === true,
    createCity: destination.createCity === true,
    place: destination.place || null,
    resolutionSource: destination.resolutionSource || null,
  };
}

async function materializeDestinationResolution(db, stored) {
  assert(stored?.countryId && stored?.cityId, 'failed-precondition', 'The resolved destination is invalid. Search again.');
  const countryRef = db.doc(`countries/${stored.countryId}`);
  const cityRef = db.doc(`countries/${stored.countryId}/destinations/${stored.cityId}`);
  const claimRef = stored.claimId
    ? db.doc(`system/runtime/destinationClaims/${stored.claimId}`)
    : null;
  const [countrySnapshot, citySnapshot, claimSnapshot] = await Promise.all([
    countryRef.get(),
    cityRef.get(),
    claimRef ? claimRef.get() : Promise.resolve(null),
  ]);
  assert(
    countrySnapshot.exists || stored.createCountry === true,
    'failed-precondition',
    'The resolved country changed. Search again.'
  );
  assert(
    citySnapshot.exists || stored.createCity === true,
    'failed-precondition',
    'The resolved destination changed. Search again.'
  );
  const countryData = countrySnapshot.exists ? countrySnapshot.data() : stored.countryData;
  const cityData = citySnapshot.exists ? citySnapshot.data() : stored.cityData;
  assert(countryData && cityData, 'failed-precondition', 'The resolved destination is invalid. Search again.');
  assert(!countrySnapshot.exists || countryData.status === 'active', 'failed-precondition', 'The matching country is not active.');
  assert(!citySnapshot.exists || cityData.status === 'active', 'failed-precondition', 'The matching destination is not active.');
  if (claimSnapshot?.exists) {
    const claimed = claimSnapshot.data() || {};
    const destinationPlaceId = stored.cityData?.providerRefs?.googlePlaceId;
    const destinationForPlace = Object.entries(claimed.entries || {})
      .find(([, entry]) => entry?.providerPlaceId === destinationPlaceId)?.[0] ||
      (claimed.providerPlaceId === destinationPlaceId ? claimed.destinationId : null);
    assert(
      !destinationForPlace || destinationForPlace === stored.cityId,
      'failed-precondition',
      'The resolved destination identity changed. Search again.'
    );
  }
  return {
    countryRef,
    cityRef,
    countryId: stored.countryId,
    cityId: stored.cityId,
    countryData,
    cityData,
    claimId: stored.claimId || null,
    claimRef,
    claimData: stored.claimData || null,
    createCountry: !countrySnapshot.exists,
    createCity: !citySnapshot.exists,
    place: stored.place || null,
    resolutionSource: stored.resolutionSource || 'resolved-token-cache',
  };
}

async function resolveDestinationFromToken({
  admin,
  auth,
  resolvedPlaceToken,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
  countryOverrideId,
}) {
  const resolvedPlace = await readResolvedPlaceToken({
    admin, auth, resolvedPlaceToken, providerRateLimitKey,
  });
  if (resolvedPlace.destinationResolution && !countryOverrideId) {
    return materializeDestinationResolution(admin.firestore(), resolvedPlace.destinationResolution);
  }
  await consumeProviderBudget({
    admin,
    auth,
    action: 'localityResolution',
    key: providerRateLimitKey,
  });
  const destination = await resolveGoogleDestination({
    admin,
    resolvedPlace,
    countryOverrideId,
    mapsKey,
    newPlacesKey,
    placesProvider,
    restCountriesKey,
  });
  if (!countryOverrideId) {
    await storeResolvedPlaceDestination({
      admin,
      auth,
      resolvedPlaceToken,
      destinationResolution: serializeDestinationResolution(destination),
      providerRateLimitKey,
    });
  }
  return destination;
}

function isExpiredResolvedPlaceError(error) {
  return ['not-found', 'deadline-exceeded'].includes(String(error?.code || '')) &&
    /expired|search again/i.test(String(error?.message || ''));
}

async function resolveSubmittedPlaceDestination({
  admin,
  auth,
  placeId,
  resolvedPlaceToken,
  countryOverrideId,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
  providerBudgetConsumed = false,
}) {
  if (resolvedPlaceToken) {
    try {
      return await resolveDestinationFromToken({
        admin, auth, resolvedPlaceToken, countryOverrideId, mapsKey,
        newPlacesKey, placesProvider, restCountriesKey, providerRateLimitKey,
      });
    } catch (error) {
      if (!placeId || !isExpiredResolvedPlaceError(error)) throw error;
      console.info('place_resolution_token_fallback', { reason: 'expired' });
    }
  }
  if (!providerBudgetConsumed) {
    await consumeProviderBudget({
      admin,
      auth,
      action: 'bilingualResolution',
      key: providerRateLimitKey,
    });
  }
  return resolveGoogleDestination({
    admin, placeId, countryOverrideId, mapsKey, newPlacesKey, placesProvider,
    restCountriesKey,
  });
}

async function resolveRecommendationDestination({
  admin,
  auth,
  data,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
}) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(
    isVerifiedCaller(auth),
    'permission-denied',
    'Email verification is required.'
  );
  const destination = await resolveSubmittedPlaceDestination({
    admin,
    auth,
    placeId: data?.placeId,
    resolvedPlaceToken: data?.resolvedPlaceToken,
    mapsKey,
    newPlacesKey,
    placesProvider,
    restCountriesKey,
    providerRateLimitKey,
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
        name: destination.cityData.googleCache?.names?.he || destination.cityData.identity?.names?.he || destination.cityData.name || destination.cityId,
        googlePlaceId: destination.cityData.providerRefs?.googlePlaceId || destination.cityData.providerIds?.googlePlaceIds?.[0] || null,
        ...(destination.cityData.identity?.coordinates || destination.cityData.coordinates
          ? { coordinates: destination.cityData.identity?.coordinates || destination.cityData.coordinates }
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
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  mediaBucket,
  providerRateLimitKey,
}) {
  const saveStartedAt = Date.now();
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
  const publishRequestId = normalizePublishRequestId(data?.publishRequestId);
  assert(
    !(recommendationId && publishRequestId),
    'invalid-argument',
    'publishRequestId is only supported when creating a recommendation.'
  );
  const recommendationRef = recommendationId
    ? db.doc(`recommendations/${recommendationId}`)
    : publishRequestId
    ? db.doc(`recommendations/${stableDocumentId('rec', `${uid}:${publishRequestId}`)}`)
    : db.collection('recommendations').doc();
  const previousSnap = recommendationId ? await recommendationRef.get() : null;
  const previousData = previousSnap?.exists ? previousSnap.data() : null;

  if (!recommendationId && publishRequestId) {
    const replaySnapshot = await recommendationRef.get();
    if (replaySnapshot.exists) {
      const replay = replaySnapshot.data() || {};
      assert(
        replay.ownerId === uid,
        'already-exists',
        'This publication request conflicts with an existing recommendation.'
      );
      console.info('recommendation_save_timing', {
        durationMs: Date.now() - saveStartedAt,
        imageCount: Array.isArray(replay.media) ? replay.media.length : 0,
        replay: true,
      });
      return {
        recommendationId: recommendationRef.id,
        country: {
          id: replay.destination?.countryId,
          name: replay.destination?.countryName || replay.destination?.countryId,
        },
        city: {
          id: replay.destination?.cityId,
          name: replay.destination?.cityName || replay.destination?.cityId,
        },
        idempotentReplay: true,
      };
    }
  }

  if (recommendationId) {
    assert(previousSnap.exists, 'not-found', 'Recommendation does not exist.');
    assert(
      previousData.ownerId === uid || auth.token?.admin === true,
      'permission-denied',
      'You do not own this recommendation.'
    );
  }

  const content = sanitizeRecommendationContent(data?.recommendation);
  const attributes = sanitizeRecommendationAttributes(
    data?.recommendation?.attributes,
    content,
    {
      legacyFacets: data?.recommendation?.facets,
      taxonomyVersion: data?.recommendation?.taxonomyVersion,
    }
  );
  const facets = buildRecommendationFacets(
	{
		...content,
		tags: Number(data?.recommendation?.taxonomyVersion || 0) >= 4
			? content.tags
			: data?.recommendation?.tags || [],
	},
    attributes
  );
  const media = await validateMediaAssets({
    admin,
    uid,
    media: data?.recommendation?.media,
    mediaBucket,
    existingMedia: previousData?.media,
  });
  let destination;
  if (data?.destinationRef) {
    destination = await resolveExistingDestination(db, data.destinationRef);
  } else {
    destination = await resolveSubmittedPlaceDestination({
      admin,
      auth,
      placeId: data?.placeId,
      resolvedPlaceToken: data?.resolvedPlaceToken,
      countryOverrideId: data?.countryOverrideId,
      mapsKey,
      newPlacesKey,
      placesProvider,
      restCountriesKey,
      providerRateLimitKey,
    });
  }

  const payload = {
    ...content,
    taxonomyVersion: taxonomy.version,
    facets,
    destination: {
      countryId: destination.countryId,
      cityId: destination.cityId,
      countryName: destination.countryData.name || destination.countryId,
      cityName: destination.cityData.googleCache?.names?.he || destination.cityData.identity?.names?.he || destination.cityData.name || destination.cityId,
    },
    media,
    place: destination.place,
    mapLocation: buildMapLocation(destination.place?.coordinates),
  };
  payload.search = buildSearchIndex({
    title: content.title,
    description: content.description,
    destination: payload.destination,
    place: payload.place,
    categoryIds: [content.categoryId],
    subcategoryIds: content.tags,
    interestIds: facets.interests,
  });

  const transactionOutcome = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(recommendationRef);
    const currentData = current.exists ? current.data() : null;
    if (!recommendationId && current.exists) {
      if (
        publishRequestId &&
        currentData?.ownerId === uid
      ) {
        return { replay: true, data: currentData };
      }
      assert(false, 'already-exists', 'Recommendation already exists.');
    }
    const previousCountryId = currentData?.destination?.countryId;
    const previousCityId = currentData?.destination?.cityId;
    const previousCityRef = previousCountryId && previousCityId
      ? db.doc(`countries/${previousCountryId}/destinations/${previousCityId}`)
      : null;
    const destinationChanged =
      !currentData || previousCityRef?.path !== destination.cityRef.path;
    const contributesToDestinationStats = !currentData || (currentData.status || 'active') === 'active';
    const [countrySnapshot, citySnapshot, previousCitySnapshot, claimSnapshot] = await Promise.all([
      transaction.get(destination.countryRef),
      transaction.get(destination.cityRef),
      previousCityRef && previousCityRef.path !== destination.cityRef.path
        ? transaction.get(previousCityRef)
        : Promise.resolve(null),
      destination.claimRef
        ? transaction.get(destination.claimRef)
        : Promise.resolve(null),
    ]);
    if (recommendationId) {
      assert(current.exists, 'not-found', 'Recommendation no longer exists.');
      assert(
        currentData.ownerId === uid || auth.token?.admin === true,
        'permission-denied',
        'Recommendation ownership changed.'
      );
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
    } else {
      assert(
        countrySnapshot.data()?.status === 'active',
        'failed-precondition',
        'The selected country is no longer active.'
      );
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
          recommendationCount: destinationChanged && contributesToDestinationStats ? 1 : 0,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      assert(
        citySnapshot.data()?.status === 'active',
        'failed-precondition',
        'The selected destination is no longer active.'
      );
      if (destinationChanged && contributesToDestinationStats) {
        transaction.update(destination.cityRef, {
          'stats.recommendationCount': Math.max(
            0,
            Number(citySnapshot.data()?.stats?.recommendationCount || 0) + 1
          ),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    if (destination.claimRef) {
      if (claimSnapshot?.exists) {
        const claimed = claimSnapshot.data() || {};
        assert(
          claimed.countryId === destination.countryId &&
            claimed.destinationType === destination.cityData.destinationType,
          'failed-precondition',
          'The destination identity claim changed while saving. Search again.'
        );
        const placeId = destination.cityData?.providerRefs?.googlePlaceId;
        const destinationForPlace = Object.entries(claimed.entries || {})
          .find(([, entry]) => entry?.providerPlaceId === placeId)?.[0] ||
          (claimed.providerPlaceId === placeId ? claimed.destinationId : null);
        assert(
          !destinationForPlace || destinationForPlace === destination.cityId,
          'failed-precondition',
          'The destination identity changed while saving. Search again.'
        );
        transaction.set(destination.claimRef, {
          ...destination.claimData,
          entries: {
            ...(claimed.entries || {}),
            ...(destination.claimData?.entries || {}),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        assert(destination.claimData, 'failed-precondition', 'The destination identity claim is missing.');
        transaction.create(destination.claimRef, {
          ...destination.claimData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    if (previousCitySnapshot?.exists && contributesToDestinationStats) {
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
        status: currentData.status || 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      transaction.create(recommendationRef, {
        ...payload,
        status: 'active',
        ownerId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        stats: { likeCount: 0, commentCount: 0 },
      });
    }
    return { replay: false };
  });

  console.info('recommendation_save_timing', {
    durationMs: Date.now() - saveStartedAt,
    imageCount: media.length,
    replay: transactionOutcome?.replay === true,
  });
  const responseDestination = transactionOutcome?.data?.destination || {
    countryId: destination.countryId,
    countryName: destination.countryData.name || destination.countryId,
    cityId: destination.cityId,
    cityName: destination.cityData.googleCache?.names?.he || destination.cityData.identity?.names?.he || destination.cityData.name || destination.cityId,
  };
  return {
    recommendationId: recommendationRef.id,
    country: {
      id: responseDestination.countryId,
      name: responseDestination.countryName || responseDestination.countryId,
    },
    city: {
      id: responseDestination.cityId,
      name: responseDestination.cityName || responseDestination.cityId,
    },
    ...(!transactionOutcome?.replay && destination.resolutionSource
      ? { resolutionSource: destination.resolutionSource }
      : {}),
    ...(transactionOutcome?.replay ? { idempotentReplay: true } : {}),
  };
}

module.exports = {
  MAX_RECOMMENDATION_IMAGES,
  MAX_RECOMMENDATION_IMAGE_BYTES,
  isVerifiedCaller,
  parsePlaceDetails,
  parseResolvedBilingualPlace,
  localityNamesForPlace,
  exactPlaceFromBilingual,
  fetchGoogleReverseCountry,
  resolvePlaceCountry,
  resolveGoogleDestination,
  resolveDestinationFromToken,
  resolveSubmittedPlaceDestination,
  resolveRecommendationDestination,
  sanitizeRecommendationContent,
  sanitizeRecommendationAttributes,
  sanitizeSubmittedFacets,
  saveRecommendation,
  stableDocumentId,
  normalizePublishRequestId,
  validateMediaAssets,
};
