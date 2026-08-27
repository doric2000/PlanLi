const crypto = require('crypto');
const { hasActiveAdminAccess } = require('./adminAuthorization');
const { HttpsError } = require('firebase-functions/v2/https');
const { evaluateTextSafety } = require('./moderationService');
const { publicationOutcome } = require('./contentPublication');
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
  RECOMMENDATION_CATALOG,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_SUBCATEGORIES,
  recommendationAttributeRequirements,
  SEASON_IDS,
  tagsMatchCategory,
  taxonomy,
  TRAVEL_PARTY_IDS,
  TRAVELER_STYLE_IDS,
  VIBE_IDS,
  isRecommendationClassificationValid,
  normalizeRecommendationCategory,
  normalizeRecommendationSubcategories,
} = require('./travelTaxonomy');
const { buildSearchIndex } = require('./discoverySearch');
const { compactDestinationSearchText } = require('./destinationCatalogService');
const {
  destinationAcceptsNewReferences,
  isDestinationReassigning,
} = require('./destinationReferencePolicy');
const {
  canonicalDestinationId,
  matchCanonicalEntry,
  registryEntriesForCountry,
} = require('./canonicalDestinationRegistry');
const {
  DESTINATION_NAMING_POLICY_VERSION,
  destinationHebrewName,
  hasHebrewName,
  normalizeDestinationHebrewData,
  transliterateDestinationName,
} = require('./destinationLocalizationService');
const {
  consumeContainingPlacesProBudget,
  provisionalDestinationKind,
  provisionalRegistryId,
} = require('./destinationResolutionPolicy');
const { distanceKm } = require('./destinationIdentityService');
const { buildMapLocation, normalizeMapCoordinates } = require('./mapLocation');
const { consumeProviderBudget } = require('./providerRateLimitService');
const {
  exactPlaceGoogleCacheFor,
} = require('./legacyPlacesAdapter');
const {
  fetchBilingualPlace,
  fetchNewContainingPlaces,
  fetchWithProviderPolicy,
  fetchLocalityPlaceId,
  localityAliases,
  providerRequestContext,
} = require('./placesProviderAdapter');
const {
  buildDestinationV3,
  candidateMatchesLocality,
  destinationClaimId,
} = require('./destinationV3Service');

const DIRECT_DESTINATION_TYPES = new Set([
  'locality',
  'postal_town',
  'island',
  'administrative_area_level_3',
  'administrative_area_level_2',
  'administrative_area_level_1',
]);
const {
  readResolvedPlaceToken,
  storeResolvedPlaceDestination,
} = require('./placesGatewayService');
const {
  createIncidentId,
  decorateLocationError,
  locationLog,
  reasonForLocationError,
} = require('./locationDiagnostics');

const MAX_RECOMMENDATION_IMAGES = 5;
const MAX_RECOMMENDATION_IMAGE_BYTES = 8 * 1024 * 1024;
const GOOGLE_REVERSE_GEOCODE_TIMEOUT_MS = 6000;
const RECOMMENDATION_CATEGORY_BY_ID = Object.freeze(Object.fromEntries(
  RECOMMENDATION_CATEGORIES.map((item) => [item.id, item])
));
const RECOMMENDATION_SUBCATEGORY_BY_ID = Object.freeze(Object.fromEntries(
  RECOMMENDATION_SUBCATEGORIES.map((item) => [item.id, item])
));
const LEGACY_TAG_IDS_BY_RECOMMENDATION_SUBCATEGORY = Object.freeze(Object.entries(
  RECOMMENDATION_CATALOG.legacyTagMappings || {}
).reduce((lookup, [legacyTagId, mapping]) => {
  if (mapping?.strategy !== 'direct' || mapping.subcategoryIds?.length !== 1) return lookup;
  const [subcategoryId] = mapping.subcategoryIds;
  lookup[subcategoryId] ||= [];
  lookup[subcategoryId].push(legacyTagId);
  return lookup;
}, {}));

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function normalizeDestinationForUse(destination, countryCode) {
  const normalized = normalizeDestinationHebrewData(destination?.cityData, {
    countryCode: countryCode || destination?.countryData?.code || destination?.countryId,
  });
  assert(hasHebrewName(normalized.name), 'failed-precondition',
    'The destination has no trustworthy Hebrew name.');
  return {
    ...destination,
    cityData: normalized.destination,
    namingPolicyVersion: DESTINATION_NAMING_POLICY_VERSION,
    repairCityName: destination?.repairCityName === true || normalized.changed,
  };
}

function destinationHebrewWritePatch(cityData) {
  return {
    namingPolicyVersion: Number(cityData?.namingPolicyVersion || DESTINATION_NAMING_POLICY_VERSION),
    'googleCache.names.he': destinationHebrewName(cityData),
    'googleCache.nameSources.he': cityData?.googleCache?.nameSources?.he || 'existing',
  };
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

const BIDI_FORMATTING_CHARACTERS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

function normalizeExternalUrl(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') failInvalidExternalUrl();
  return value.replace(BIDI_FORMATTING_CHARACTERS, '').trim();
}

function failInvalidExternalUrl() {
  throw new HttpsError('invalid-argument', 'externalUrl is invalid.', {
    reason: 'invalid_external_url',
    retryable: false,
  });
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

function sanitizeRecommendationCatalogContent(data) {
  assert(RECOMMENDATION_CATALOG.runtimeEnabled === true,
    'failed-precondition', 'The recommendation catalog is not active.');
  const catalogVersion = Number(data.recommendationCatalogVersion || 0);
  assert(catalogVersion === Number(RECOMMENDATION_CATALOG.schemaVersion || 0),
    'failed-precondition', 'Update PlanLi to use the current recommendation catalog.');

  const categoryId = normalizeRecommendationCategory(data.categoryId);
  const rawSubcategoryIds = cleanStringArray(data.subcategoryIds || [], {
    field: 'subcategoryIds',
    maxItems: RECOMMENDATION_CATALOG.selection?.subcategories?.max || 3,
    maxLength: 80,
  });
  const subcategoryIds = normalizeRecommendationSubcategories(rawSubcategoryIds, categoryId);
  const customSubcategoryLabel = cleanOptionalString(data.customSubcategoryLabel, {
    field: 'customSubcategoryLabel',
    max: RECOMMENDATION_CATALOG.selection?.customLabel?.maxLength || 40,
  });
  assert(isRecommendationClassificationValid({
    categoryId,
    subcategoryIds: rawSubcategoryIds,
    customSubcategoryLabel,
  }), 'invalid-argument', 'The recommendation classification is invalid.');

  const legacyTags = Array.from(new Set(subcategoryIds.flatMap(
    (subcategoryId) => LEGACY_TAG_IDS_BY_RECOMMENDATION_SUBCATEGORY[subcategoryId] || []
  )));
  const catalogInterestIds = Array.from(new Set(subcategoryIds.flatMap(
    (subcategoryId) => RECOMMENDATION_SUBCATEGORY_BY_ID[subcategoryId]?.interestIds || []
  )));
  const rawBudget = cleanOptionalString(data.budget, { field: 'budget', max: 50 });
  const budget = normalizeBudget(rawBudget, { allowFlexible: false });
  assert(!rawBudget || budget, 'invalid-argument', 'budget is invalid.');
  assert(budget && POST_BUDGET_IDS.includes(budget), 'invalid-argument', 'budget is required.');

  return {
    title: cleanString(data.title, { field: 'title', min: 1, max: 120 }),
    description: cleanString(data.description, { field: 'description', min: 1, max: 5000 }),
    category: RECOMMENDATION_CATEGORY_BY_ID[categoryId]?.label || categoryId,
    categoryId,
    subcategoryIds,
    customSubcategoryLabel,
    catalogInterestIds,
    recommendationCatalogVersion: catalogVersion,
    tags: legacyTags,
    budget,
  };
}

function sanitizeRecommendationContent(data) {
  assert(data && typeof data === 'object', 'invalid-argument', 'Missing recommendation data.');
  if (data.recommendationCatalogVersion != null || Array.isArray(data.subcategoryIds)) {
    return sanitizeRecommendationCatalogContent(data);
  }
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

function sanitizeRecommendationDetails(value, content) {
  if (value == null) {
    assert(content.categoryId !== 'events', 'invalid-argument', 'Event timing is required.');
    return {};
  }
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'details are invalid.');
  const allowedFields = [
    'contactName', 'phone', 'externalUrl', 'priceNote', 'accessibilityNote', 'eventSchedule',
  ];
  assert(Object.keys(value).every((key) => allowedFields.includes(key)),
    'invalid-argument', 'details contain unsupported fields.');
  const details = {
    contactName: cleanOptionalString(value.contactName, { field: 'contactName', max: 80 }),
    phone: cleanOptionalString(value.phone, { field: 'phone', max: 40 }),
    externalUrl: cleanOptionalString(normalizeExternalUrl(value.externalUrl), { field: 'externalUrl', max: 500 }),
    priceNote: cleanOptionalString(value.priceNote, { field: 'priceNote', max: 120 }),
    accessibilityNote: cleanOptionalString(value.accessibilityNote, { field: 'accessibilityNote', max: 500 }),
    eventSchedule: cleanOptionalString(value.eventSchedule, { field: 'eventSchedule', max: 160 }),
  };
  if (details.phone) {
    assert(/^[+\d][\d\s().-]{3,39}$/.test(details.phone),
      'invalid-argument', 'phone is invalid.');
  }
  if (details.externalUrl) {
    let parsed;
    try {
      parsed = new URL(details.externalUrl);
    } catch (_) {
      failInvalidExternalUrl();
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      failInvalidExternalUrl();
    }
  }
  assert(content.categoryId !== 'events' || details.eventSchedule,
    'invalid-argument', 'Event timing is required.');
  return Object.fromEntries(Object.entries(details).filter(([, entry]) => entry));
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
    localityCandidates: Array.from(new Set([
      ...(place.localityCandidates || []),
      ...(english.localityCandidates || []),
    ].map((value) => String(value || '').trim()).filter(Boolean))),
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
    requestContext,
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
    const response = requestContext
      ? await fetchWithProviderPolicy(url, {}, { fetchImpl, requestContext, timeoutMs })
      : await fetchImpl(url, { signal: controller.signal });
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
  } catch (error) {
    if (String(error?.code || '').replace(/^functions\//, '') === 'resource-exhausted') throw error;
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
  requestContext,
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
      aliases: [
        ...(parsedCity?.localityCandidates || []),
        ...(parsedPlace?.localityCandidates || []),
      ],
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

  const reverseCountry = await fetchGoogleReverseCountry(coordinates, mapsKey, { requestContext });
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
  assert(
    metadata.metadata?.state === 'prepared',
    'failed-precondition',
    'This prepared image has already been used.'
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

function cleanRecommendationDestinationRef(destinationRef) {
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
  const provider = cleanOptionalString(destinationRef.provider, {
    field: 'destinationRef.provider',
    max: 40,
  });
  assert(!provider || provider === 'google', 'invalid-argument', 'destinationRef.provider is invalid.');
  const providerPlaceId = cleanOptionalString(destinationRef.providerPlaceId, {
    field: 'destinationRef.providerPlaceId',
    max: 300,
  });
  const resolvedPlaceToken = providerPlaceId
    ? cleanOptionalString(destinationRef.resolvedPlaceToken, {
        field: 'destinationRef.resolvedPlaceToken',
        max: 500,
      })
    : '';
  return {
    countryId,
    cityId,
    ...(providerPlaceId ? {
      provider: 'google',
      providerPlaceId,
      ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
    } : {}),
  };
}

function destinationUnavailable(message) {
  throw new HttpsError('not-found', message, {
    reason: 'destination_not_found',
    retryable: false,
  });
}

async function resolveExistingDestination(db, destinationRef) {
  let { countryId, cityId } = cleanRecommendationDestinationRef(destinationRef);
  const visited = new Set();
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const destinationKey = `${countryId}/${cityId}`;
    if (visited.has(destinationKey)) destinationUnavailable('Destination merge cycle detected.');
    visited.add(destinationKey);
    const countryRef = db.doc(`countries/${countryId}`);
    const cityRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
    const [countrySnap, citySnap] = await Promise.all([
      countryRef.get(),
      cityRef.get(),
    ]);
    if (!citySnap.exists) destinationUnavailable('Destination does not exist.');
    const cityData = citySnap.data() || {};
    if (isDestinationReassigning(cityData)) {
      throw new HttpsError(
        'failed-precondition',
        'The destination is being reassigned. Try again shortly.',
        { reason: 'destination_reassignment_in_progress', retryable: true }
      );
    }
    if (destinationAcceptsNewReferences(cityData)) {
      if (!countrySnap.exists || countrySnap.data()?.status !== 'active') {
        destinationUnavailable('Destination is not active.');
      }
      return normalizeDestinationForUse({
        countryRef,
        cityRef,
        countryId,
        cityId,
        countryData: countrySnap.data(),
        cityData,
        createCountry: false,
        createCity: false,
        place: null,
        resolutionSource: visited.size > 1 ? 'merged_destination_redirect' : 'existing_destination',
      }, countrySnap.data()?.code || countryId);
    }
    const mergedCountryId = String(cityData.mergedInto?.countryId || '').trim();
    const mergedCityId = String(cityData.mergedInto?.cityId || '').trim();
    if (!mergedCountryId || !mergedCityId) destinationUnavailable('Destination is not active.');
    ({ countryId, cityId } = cleanRecommendationDestinationRef({
      countryId: mergedCountryId,
      cityId: mergedCityId,
    }));
  }
  destinationUnavailable('Destination merge chain is too long.');
}

async function resolveRecommendationDestinationRef({
  admin,
  auth,
  destinationRef,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
  resolveExisting = resolveExistingDestination,
  resolveSubmitted = resolveSubmittedPlaceDestination,
}) {
  const cleaned = cleanRecommendationDestinationRef(destinationRef);
  if (!cleaned.providerPlaceId) {
    return resolveExisting(admin.firestore(), cleaned);
  }
  const destination = await resolveSubmitted({
    admin,
    auth,
    placeId: cleaned.providerPlaceId,
    resolvedPlaceToken: cleaned.resolvedPlaceToken || null,
    mapsKey,
    newPlacesKey,
    placesProvider,
    restCountriesKey,
    providerRateLimitKey,
    selectionIntent: 'destination',
  });
  let expectedCountryId = cleaned.countryId;
  let expectedCityId = cleaned.cityId;
  if (destination.countryId !== expectedCountryId || destination.cityId !== expectedCityId) {
    try {
      const redirected = await resolveExisting(admin.firestore(), cleaned);
      expectedCountryId = redirected.countryId;
      expectedCityId = redirected.cityId;
    } catch (error) {
      if (error?.details?.retryable === true) throw error;
      // The provider identity assertion below remains authoritative for a
      // destination that never existed in the catalog.
    }
  }
  assert(
    destination.countryId === expectedCountryId && destination.cityId === expectedCityId,
    'failed-precondition',
    'The provider destination does not match the selected destination. Search again.'
  );
  return destination;
}

async function resolveUnchangedExactRecommendation({
  db,
  locationMode,
  placeId,
  destinationRef,
  previousData,
  resolveExisting = resolveExistingDestination,
}) {
  const previousPlaceId = String(previousData?.place?.placeId || '').trim();
  const submittedPlaceId = String(placeId || '').trim();
  const previousDestination = previousData?.destination;
  if (
    locationMode !== 'exact' ||
    !submittedPlaceId ||
    submittedPlaceId !== previousPlaceId ||
    !previousDestination?.countryId ||
    !previousDestination?.cityId ||
    !destinationRef?.countryId ||
    !destinationRef?.cityId
  ) {
    return null;
  }

  const resolveCanonical = async (value) => {
    try {
      return await resolveExisting(db, {
        countryId: value.countryId,
        cityId: value.cityId,
      });
    } catch (error) {
      if (error?.details?.retryable === true) throw error;
      return null;
    }
  };
  const [submittedDestination, previousCanonicalDestination] = await Promise.all([
    resolveCanonical(destinationRef),
    resolveCanonical(previousDestination),
  ]);
  if (
    !submittedDestination ||
    !previousCanonicalDestination ||
    submittedDestination.countryId !== previousCanonicalDestination.countryId ||
    submittedDestination.cityId !== previousCanonicalDestination.cityId
  ) {
    return null;
  }
  return {
    ...submittedDestination,
    place: previousData.place,
    resolutionSource: 'existing_recommendation_location',
  };
}

function destinationContainsCoordinates(destination, coordinates) {
  const viewport = destination?.googleCache?.viewport ||
    destination?.identity?.viewport || destination?.viewport;
  const south = Number(viewport?.southwest?.lat);
  const west = Number(viewport?.southwest?.lng);
  const north = Number(viewport?.northeast?.lat);
  const east = Number(viewport?.northeast?.lng);
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  if (![south, west, north, east, lat, lng].every(Number.isFinite)) return false;
  const insideLatitude = lat >= Math.min(south, north) && lat <= Math.max(south, north);
  const insideLongitude = west <= east
    ? lng >= west && lng <= east
    : lng >= west || lng <= east;
  return insideLatitude && insideLongitude;
}

function destinationHasGeometry(destination) {
  const viewport = destination?.googleCache?.viewport ||
    destination?.identity?.viewport || destination?.viewport;
  const coordinates = destination?.googleCache?.coordinates ||
    destination?.identity?.coordinates || destination?.coordinates;
  return Boolean(normalizeMapCoordinates(coordinates)) || Boolean(
    viewport?.southwest && viewport?.northeast
  );
}

function assertPlaceMatchesDestinationGeometry(destination, place) {
  const coordinates = normalizeMapCoordinates(place?.coordinates);
  assert(coordinates, 'failed-precondition', 'The selected place has no valid coordinates. Search again.');
  if (!destinationHasGeometry(destination?.cityData)) return;
  const cityCoordinates = normalizeMapCoordinates(
    destination?.cityData?.googleCache?.coordinates ||
    destination?.cityData?.identity?.coordinates ||
    destination?.cityData?.coordinates
  );
  const insideViewport = destinationContainsCoordinates(destination?.cityData, coordinates);
  const nearDestination = cityCoordinates
    ? distanceKm(cityCoordinates, coordinates) <= 100
    : false;
  if (!insideViewport && !nearDestination) {
    throw new HttpsError(
      'failed-precondition',
      'Choose a destination that contains the selected place.',
      { reason: 'destination_outside_bounds', retryable: false }
    );
  }
}

function manualPlaceForDestination(value, destination) {
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'manualLocation is invalid.');
  const coordinates = normalizeMapCoordinates(value.coordinates);
  assert(coordinates, 'invalid-argument', 'manualLocation coordinates are invalid.');
  const cityCoordinates = normalizeMapCoordinates(
    destination?.cityData?.googleCache?.coordinates ||
    destination?.cityData?.identity?.coordinates ||
    destination?.cityData?.coordinates
  );
  const insideViewport = destinationContainsCoordinates(destination?.cityData, coordinates);
  const nearDestination = cityCoordinates
    ? distanceKm(cityCoordinates, coordinates) <= 100
    : false;
  assert(insideViewport || nearDestination,
    'invalid-argument', 'The manual location is outside the selected destination.');
  const label = cleanOptionalString(value.label, { field: 'manualLocation label', max: 120 });
  return {
    name: label || destinationHebrewName(destination.cityData) || destination.cityId,
    address: '',
    coordinates,
    source: 'manual_pin',
  };
}

function isSettlementDestination(destination) {
  if (['city', 'town', 'village'].includes(destination?.destinationType)) return true;
  const types = destination?.googleCache?.types || destination?.identity?.types || [];
  return Array.isArray(types) && types.some((type) =>
    ['locality', 'postal_town', 'administrative_area_level_3'].includes(type)
  );
}

function isThaiProvinceDestination(destination) {
  const types = destination?.googleCache?.types || destination?.identity?.types || [];
  if (Array.isArray(types) && types.length) {
    return types.includes('administrative_area_level_1');
  }
  return destination?.destinationType === 'region';
}

function isAdministrativeDestination(destination) {
  const types = destination?.googleCache?.types || destination?.identity?.types || [];
  return destination?.destinationType === 'region' ||
    (Array.isArray(types) && types.some((type) =>
      ['administrative_area_level_1', 'administrative_area_level_2'].includes(type)
    ));
}

async function findExistingDestinationByAlias({
  db,
  countryCode,
  localityCandidates,
  coordinates,
  countryOverrideId,
}) {
  const aliases = Array.from(new Set((localityCandidates || [])
    .flatMap((value) => localityAliases(value, countryCode))
    .map(compactDestinationSearchText)
    .filter((value) => value.length >= 2)))
    .sort((left, right) => left.length - right.length)
    .slice(0, 3);
  if (!coordinates || !/^[A-Z]{2}$/.test(String(countryCode || ''))) return null;

  const countrySnapshot = await db.collection('countries')
    .where('code', '==', String(countryCode).toUpperCase())
    .limit(5)
    .get();
  const countries = new Map(countrySnapshot.docs
    .filter((document) => document.data()?.status === 'active')
    .filter((document) => !countryOverrideId || document.id === countryOverrideId)
    .map((document) => [document.id, document.data()]));
  if (!countries.size) return null;

  const catalogDocuments = new Map();
  for (const countryId of countries.keys()) {
    let snapshot = { docs: [] };
    try {
      let query = db.collection('destinationCatalog').where('countryId', '==', countryId);
      query = query.where('status', '==', 'active');
      query = query.where('destinationClass', '==', 'settlement');
      snapshot = await query.get();
    } catch (error) {
      // Older test doubles and a catalog during the staged index rollout cannot
      // serve the spatial projection yet. Alias resolution remains available.
      if (!(error instanceof TypeError) && error?.code !== 9 && error?.code !== 'failed-precondition') throw error;
    }
    snapshot.docs.forEach((document) => {
      const data = document.data() || {};
      if (data.status === 'active' && data.countryId === countryId) {
        catalogDocuments.set(`${data.countryId}:${data.cityId}`, data);
      }
    });
  }
  for (const alias of aliases) {
    const snapshot = await db.collection('destinationCatalog')
      .where('search.prefixes', 'array-contains', alias.slice(0, 16))
      .limit(20)
      .get();
    snapshot.docs.forEach((document) => {
      const data = document.data() || {};
      const names = [data.names?.he, data.names?.en]
        .flatMap((value) => localityAliases(value, countryCode))
        .map(compactDestinationSearchText);
      if (data.status === 'active' && countries.has(data.countryId) &&
          aliases.some((candidate) => names.includes(candidate))) {
        catalogDocuments.set(`${data.countryId}:${data.cityId}`, data);
      }
    });
  }
  if (!catalogDocuments.size) return null;

  const entries = Array.from(catalogDocuments.values());
  const citySnapshots = await Promise.all(entries.map((entry) =>
    db.doc(`countries/${entry.countryId}/destinations/${entry.cityId}`).get()
  ));
  const matches = citySnapshots.map((snapshot, index) => {
    const entry = entries[index];
    const cityData = snapshot.exists ? snapshot.data() || {} : null;
    const projectedDestination = {
      ...cityData,
      destinationType: cityData?.destinationType || entry.destinationType,
      googleCache: {
        ...(cityData?.googleCache || {}),
        coordinates: cityData?.googleCache?.coordinates || entry.coordinates,
        viewport: cityData?.googleCache?.viewport || entry.viewport,
        types: cityData?.googleCache?.types || entry.googleTypes,
      },
    };
    const cityCoordinates = projectedDestination.googleCache.coordinates ||
      cityData?.identity?.coordinates || cityData?.coordinates;
    if (!cityData || cityData.status !== 'active' || !cityCoordinates) return null;
    const names = [entry.names?.he, entry.names?.en,
      cityData?.googleCache?.names?.he, cityData?.googleCache?.names?.en,
      cityData?.identity?.names?.he, cityData?.identity?.names?.en]
      .flatMap((value) => localityAliases(value, countryCode))
      .map(compactDestinationSearchText);
    return {
      countryId: entry.countryId,
      countryData: countries.get(entry.countryId),
      cityId: entry.cityId,
      cityData,
      distanceKm: distanceKm(coordinates, cityCoordinates),
      containsCoordinates: destinationContainsCoordinates(projectedDestination, coordinates),
      aliasMatched: aliases.some((alias) => names.includes(alias)),
      isSettlement: isSettlementDestination(projectedDestination),
      isThaiProvince: isThaiProvinceDestination(projectedDestination),
    };
  }).filter(Boolean)
    .sort((left, right) => left.distanceKm - right.distanceKm || left.cityId.localeCompare(right.cityId));
  if (!matches.length) return null;

  // A confidently containing settlement always wins over an administrative area.
  // Ambiguity is considered only within the best eligible settlement class.
  const containingSettlements = matches.filter((entry) => entry.isSettlement && entry.containsCoordinates);
  if (containingSettlements.length === 1) return containingSettlements[0];
  if (containingSettlements.length > 1) {
    if (containingSettlements[1].distanceKm - containingSettlements[0].distanceKm < 5) {
      return { ambiguity: containingSettlements.slice(0, 3) };
    }
    return containingSettlements[0];
  }
  if (String(countryCode).toUpperCase() === 'TH') {
    const provinces = matches.filter((entry) =>
      entry.isThaiProvince && entry.aliasMatched && entry.distanceKm <= 50
    );
    if (provinces.length === 1) return provinces[0];
    if (provinces.length > 1) {
      if (provinces[1].distanceKm - provinces[0].distanceKm < 5) {
        return { ambiguity: provinces.slice(0, 3) };
      }
      return provinces[0];
    }
  }
  const aliasedSettlements = String(countryCode).toUpperCase() === 'TH' ? [] : matches.filter((entry) =>
    entry.isSettlement && entry.aliasMatched && entry.distanceKm <= 50
  );
  if (aliasedSettlements.length === 1) return aliasedSettlements[0];
  if (aliasedSettlements.length > 1) {
    if (aliasedSettlements[1].distanceKm - aliasedSettlements[0].distanceKm < 5) {
      return { ambiguity: aliasedSettlements.slice(0, 3) };
    }
    return aliasedSettlements[0];
  }
  const aliasedAreas = matches.filter((entry) =>
    !entry.isSettlement && entry.aliasMatched && entry.distanceKm <= 50
  );
  if (!aliasedAreas.length) return null;
  if (aliasedAreas.length > 1 && aliasedAreas[1].distanceKm - aliasedAreas[0].distanceKm < 5) {
    return { ambiguity: aliasedAreas.slice(0, 3) };
  }
  return aliasedAreas[0];
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
  selectionIntent = 'exact_place',
  confirmedHebrewName = null,
  requestContext = providerRequestContext(),
}) {
  const db = admin.firestore();
  const bilingual = resolvedPlace || await fetchBilingualPlace({
    provider: placesProvider, placeId, mapsKey, newPlacesKey,
    requestContext,
  });
  const parsed = parseResolvedBilingualPlace(bilingual);
  const selectedEn = bilingual.en || {};
  // Only promote the Google entity the user selected directly. A venue's
  // locality/address components still go through the reviewed registry and
  // must never create raw destinations such as Rivas or Kannan Devan Hills.
  // `natural_feature` is intentionally excluded: it can be a single lake,
  // mountain or attraction rather than a traveler-facing destination.
  const selectedIsDestination = (selectedEn.types || [])
    .some((type) => DIRECT_DESTINATION_TYPES.has(type));
  const selectedCoordinates = selectedEn.coordinates || bilingual.he?.coordinates;
  const preliminaryCountry = await resolvePlaceCountry({
    parsedPlace: parsed,
    parsedCity: parsed,
    mapsKey,
    requestContext,
  });
  const registryEntries = await registryEntriesForCountry(db, preliminaryCountry.countryCode);
  let canonicalMatch = matchCanonicalEntry(registryEntries, {
    countryCode: preliminaryCountry.countryCode,
    providerPlaceId: parsed.placeId,
    aliases: [
      ...(selectedIsDestination ? [selectedEn.displayName] : []),
      selectedEn.localityName,
      ...localityNamesForPlace(selectedEn),
      ...(preliminaryCountry.countryCode === 'IN'
        ? (selectedEn.addressDescriptorCandidates || []).map((entry) => entry.name)
        : []),
    ],
    coordinates: selectedCoordinates,
  });
  if (!canonicalMatch && !selectedIsDestination && selectionIntent !== 'destination' &&
      placesProvider === 'new' && parsed.placeId) {
    let proAllowed = false;
    try {
      proAllowed = await consumeContainingPlacesProBudget(admin);
    } catch {
      proAllowed = false;
    }
    if (proAllowed) {
      try {
        const containingPlaces = await fetchNewContainingPlaces({
          placeId: parsed.placeId,
          newPlacesKey,
          requestContext,
        });
        for (const containing of containingPlaces) {
          canonicalMatch = matchCanonicalEntry(registryEntries, {
            countryCode: preliminaryCountry.countryCode,
            providerPlaceId: containing.placeId,
            aliases: [containing.name],
            coordinates: selectedCoordinates,
          });
          if (canonicalMatch) {
            canonicalMatch.source = 'canonical_containing_places_pro';
            break;
          }
        }
      } catch (error) {
        locationLog('destination', {
          incidentId: requestContext.incidentId,
          outcome: 'fallback',
          durationMs: 0,
          reason: 'containing_places_unavailable',
          fallbackPath: 'destination_selection',
        });
      }
    }
  }
  if (canonicalMatch?.ambiguity?.length) {
    const ambiguityError = new HttpsError(
      'failed-precondition',
      'The place belongs to more than one approved destination. Please choose a destination.'
    );
    ambiguityError.destinationSelectionRequired = true;
    ambiguityError.destinationCountryCode = preliminaryCountry.countryCode;
    ambiguityError.providerCallCount = requestContext.count;
    throw ambiguityError;
  }
  let canonicalEntry = canonicalMatch?.entry || null;
  let provisionalDestination = false;
  const directlySelectedDestination = selectedIsDestination &&
    (selectionIntent === 'destination' || selectionIntent === 'exact_place');
  if (!canonicalEntry && directlySelectedDestination) {
    assert(selectedIsDestination, 'invalid-argument',
      'Choose a city, island, province, or tourism region as the destination.');
    const englishName = String(selectedEn.displayName || selectedEn.localityName || '').trim();
    const googleHebrewName = String(bilingual.he?.displayName || bilingual.he?.localityName || '').trim();
    const confirmedName = confirmedHebrewName == null || confirmedHebrewName === '' ? '' : cleanString(
      confirmedHebrewName, { field: 'confirmedHebrewName', min: 2, max: 80 }
    );
    if (confirmedName) {
      assert(hasHebrewName(confirmedName), 'invalid-argument',
        'The confirmed destination name must contain Hebrew.');
    }
    const hasReliableGoogleHebrewName = hasHebrewName(googleHebrewName);
    const suggestedHebrewName = hasReliableGoogleHebrewName
      ? googleHebrewName
      : transliterateDestinationName(englishName);
    if (!confirmedName && !hasReliableGoogleHebrewName) {
      // Exact-place selection has no inline naming editor. Keep the exact
      // place preview and route the user through the shared destination
      // picker, where naming is supported, instead of accepting a generated
      // transliteration as public truth.
      if (selectionIntent !== 'destination') {
        const selectionError = new HttpsError(
          'failed-precondition',
          'This destination needs a verified Hebrew name. Please choose it as a destination.'
        );
        selectionError.destinationSelectionRequired = true;
        selectionError.destinationCountryCode = preliminaryCountry.countryCode;
        selectionError.providerCallCount = requestContext.count;
        throw selectionError;
      }
      return {
        requiresNameConfirmation: true,
        status: 'destination_name_confirmation_required',
        place: exactPlaceFromBilingual(
          bilingual,
          bilingual.fetchedAt instanceof Date ? bilingual.fetchedAt : new Date()
        ),
        nameConfirmation: {
          englishName,
          suggestedHebrewName,
          countryName: preliminaryCountry.countryName || bilingual.he?.countryName ||
            bilingual.en?.countryName || preliminaryCountry.countryCode,
        },
        providerCallCount: requestContext.count,
      };
    }
    const reliableHebrewName = confirmedName || googleHebrewName;
    provisionalDestination = true;
    canonicalEntry = {
      id: provisionalRegistryId(preliminaryCountry.countryCode, parsed.placeId),
      countryCode: preliminaryCountry.countryCode,
      names: { he: reliableHebrewName, en: englishName || reliableHebrewName },
      aliases: [englishName, reliableHebrewName].filter(Boolean),
      kind: provisionalDestinationKind(selectedEn.types),
      groupingPolicy: 'self',
      center: selectedCoordinates,
      viewport: selectedEn.viewport || bilingual.he?.viewport || null,
      providerRefs: { googlePlaceId: parsed.placeId },
      googleTypes: selectedEn.types || [],
      registryVersion: 0,
      geometryPolicy: {
        autoMatchEligible: false,
        aliasAutoMatchEligible: false,
        source: 'user_selected_provisional',
        version: 2,
      },
    };
    canonicalMatch = { entry: canonicalEntry, source: 'user_selected_provisional' };
  }
  let destinationBilingual = bilingual;
  if (!canonicalEntry) {
    const localityCandidates = localityNamesForPlace(selectedEn);
    const existingDestination = await findExistingDestinationByAlias({
      db,
      countryCode: preliminaryCountry.countryCode,
      localityCandidates,
      coordinates: selectedEn.coordinates || bilingual.he?.coordinates,
      countryOverrideId,
    });
    const approvedAmbiguity = existingDestination?.ambiguity?.filter((candidate) =>
      candidate.cityData?.canonicalPolicy?.approved === true &&
      destinationAcceptsNewReferences(candidate.cityData)
    ) || [];
    const deferAdministrativeAmbiguity = approvedAmbiguity.length &&
      preliminaryCountry.countryCode !== 'TH' &&
      approvedAmbiguity.every((candidate) => isAdministrativeDestination(candidate.cityData));
    if (approvedAmbiguity.length > 1 && !deferAdministrativeAmbiguity) {
      const error = new HttpsError('failed-precondition',
        'The destination locality is ambiguous. Please choose the correct destination.');
      error.destinationChoices = approvedAmbiguity.map((candidate) => ({
        countryId: candidate.countryId,
        cityId: candidate.cityId,
        countryData: candidate.countryData,
        cityData: candidate.cityData,
        createCountry: false,
        createCity: false,
        place: exactPlaceFromBilingual(
          bilingual,
          bilingual.fetchedAt instanceof Date ? bilingual.fetchedAt : new Date()
        ),
        resolutionSource: preliminaryCountry.resolutionSource,
      }));
      error.providerCallCount = requestContext.count;
      throw error;
    }
    const explicitlySelectedLegacyDestination = selectionIntent === 'destination' &&
      existingDestination && !existingDestination.ambiguity &&
      existingDestination.cityData?.providerRefs?.googlePlaceId === parsed.placeId;
    const approvedExistingDestination = existingDestination && !existingDestination.ambiguity &&
      (existingDestination.cityData?.canonicalPolicy?.approved === true || explicitlySelectedLegacyDestination) &&
      destinationAcceptsNewReferences(existingDestination.cityData);
    const deferAdministrativeFallback = approvedExistingDestination &&
      preliminaryCountry.countryCode !== 'TH' &&
      isAdministrativeDestination(approvedExistingDestination.cityData);
    if (approvedExistingDestination && !deferAdministrativeFallback) {
      const destination = {
        countryRef: db.doc(`countries/${approvedExistingDestination.countryId}`),
        cityRef: db.doc(
          `countries/${approvedExistingDestination.countryId}/destinations/${approvedExistingDestination.cityId}`
        ),
        countryId: approvedExistingDestination.countryId,
        cityId: approvedExistingDestination.cityId,
        countryData: approvedExistingDestination.countryData,
        cityData: approvedExistingDestination.cityData,
        createCountry: false,
        createCity: false,
        place: exactPlaceFromBilingual(
          bilingual,
          bilingual.fetchedAt instanceof Date ? bilingual.fetchedAt : new Date()
        ),
        resolutionSource: preliminaryCountry.resolutionSource,
        providerCallCount: requestContext.count,
      };
      return normalizeDestinationForUse(destination, preliminaryCountry.countryCode);
    }
    const selectionError = new HttpsError('failed-precondition',
      'This place is not mapped to an approved PlanLi destination. Please choose a destination.');
    selectionError.destinationSelectionRequired = true;
    selectionError.destinationCountryCode = preliminaryCountry.countryCode;
    throw selectionError;
  }
  const resolvedCountry = preliminaryCountry;

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
  const canonicalCoordinates = canonicalEntry.center || selectedCoordinates;
  const canonicalViewport = canonicalEntry.viewport || (canonicalEntry.radiusKm ? {
    southwest: {
      lat: canonicalCoordinates.lat - Number(canonicalEntry.radiusKm) / 111,
      lng: canonicalCoordinates.lng - Number(canonicalEntry.radiusKm) / (111 * Math.max(0.2, Math.cos(canonicalCoordinates.lat * Math.PI / 180))),
    },
    northeast: {
      lat: canonicalCoordinates.lat + Number(canonicalEntry.radiusKm) / 111,
      lng: canonicalCoordinates.lng + Number(canonicalEntry.radiusKm) / (111 * Math.max(0.2, Math.cos(canonicalCoordinates.lat * Math.PI / 180))),
    },
  } : null);
  const canonicalType = {
    city_hub: 'city', island: 'island', tourism_region: 'region', province: 'region',
  }[canonicalEntry.kind];
  const canonicalPlaceId = canonicalEntry.providerRefs?.googlePlaceId || null;
  const canonicalCityId = canonicalDestinationId(countryId, canonicalEntry.id);
  const builtDestination = {
    id: canonicalCityId,
    data: {
      schemaVersion: 3,
      namingPolicyVersion: DESTINATION_NAMING_POLICY_VERSION,
      countryId,
      destinationType: canonicalType,
      providerRefs: canonicalPlaceId ? { googlePlaceId: canonicalPlaceId } : {},
      googleCache: {
        placeId: canonicalPlaceId,
        countryCode: resolvedCountry.countryCode,
        names: { ...canonicalEntry.names },
        nameSources: { he: 'planli_registry', en: 'planli_registry' },
        coordinates: canonicalCoordinates,
        viewport: canonicalViewport,
        types: canonicalEntry.googleTypes || [],
        fetchedAt: new Date(),
        refreshAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 366 * 24 * 60 * 60 * 1000),
      },
      canonicalPolicy: {
        approved: !provisionalDestination,
        registryId: canonicalEntry.id,
        kind: canonicalEntry.kind,
        parentId: canonicalEntry.parentId || null,
        groupingPolicy: canonicalEntry.groupingPolicy,
        aliases: canonicalEntry.aliases || [],
        registryVersion: canonicalEntry.registryVersion || 1,
        ...(provisionalDestination ? {
          provisional: true,
          reviewState: 'pending',
          selectionSource: 'user_confirmed_destination',
        } : {}),
      },
      stats: { recommendationCount: 0 },
      status: 'active',
    },
  };
  const claimId = canonicalPlaceId ? destinationClaimId({
    countryId,
    type: builtDestination.data.destinationType,
    nameEn: builtDestination.data.googleCache.names.en,
  }) : null;
  const claimRef = claimId ? db.doc(`system/runtime/destinationClaims/${claimId}`) : null;
  const claimData = {
    countryId,
    destinationType: builtDestination.data.destinationType,
    nameEn: builtDestination.data.googleCache.names.en,
    entries: {
      [builtDestination.id]: { providerPlaceId: canonicalPlaceId },
    },
  };
  const canonicalCityRef = db.doc(`countries/${countryId}/destinations/${builtDestination.id}`);
  const canonicalCitySnapshot = await canonicalCityRef.get();
  if (canonicalCitySnapshot.exists) {
    cityId = canonicalCitySnapshot.id;
    cityData = canonicalCitySnapshot.data();
    assert(
      destinationAcceptsNewReferences(cityData) &&
        (cityData?.canonicalPolicy?.approved === true ||
          (provisionalDestination && cityData?.canonicalPolicy?.provisional === true)) &&
        cityData?.canonicalPolicy?.registryId === canonicalEntry.id,
      'failed-precondition',
      'The canonical destination identity is not active.'
    );
  }

  if (!cityId && canonicalPlaceId) {
    const providerMatches = await destinations
      .where('providerRefs.googlePlaceId', '==', canonicalPlaceId)
      .limit(10)
      .get();
    const approvedMatch = providerMatches.docs.find((document) => {
      const data = document.data() || {};
      return destinationAcceptsNewReferences(data) &&
        (data.canonicalPolicy?.approved === true ||
          (provisionalDestination && data.canonicalPolicy?.provisional === true)) &&
        data.canonicalPolicy?.registryId === canonicalEntry.id;
    });
    if (approvedMatch) {
      cityId = approvedMatch.id;
      cityData = approvedMatch.data();
    }
  }

  if (!cityId && claimRef) {
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
        .find(([, entry]) => entry?.providerPlaceId === canonicalPlaceId);
      const claimedDestinationId = claimedEntry?.[0] ||
        (claimed.providerPlaceId === canonicalPlaceId ? claimed.destinationId : null);
      if (claimedDestinationId) {
        const claimedCitySnapshot = await db
          .doc(`countries/${countryId}/destinations/${claimedDestinationId}`)
          .get();
        const claimedCity = claimedCitySnapshot.exists ? claimedCitySnapshot.data() || {} : null;
        if (claimedCity && destinationAcceptsNewReferences(claimedCity) &&
            (claimedCity.canonicalPolicy?.approved === true ||
              (provisionalDestination && claimedCity.canonicalPolicy?.provisional === true)) &&
            claimedCity.canonicalPolicy?.registryId === canonicalEntry.id) {
          cityId = claimedDestinationId;
          cityData = claimedCity;
        }
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
        destinationAcceptsNewReferences(cityData),
        'failed-precondition',
        'The matching destination is not active.'
      );
    }
  }

  if (!cityData) {
    cityData = builtDestination.data;
  }

  const destination = normalizeDestinationForUse({
    countryRef: db.doc(`countries/${countryId}`),
    cityRef: db.doc(`countries/${countryId}/destinations/${cityId}`),
    countryId,
    cityId,
    countryData,
    cityData,
    claimId,
    claimRef,
    claimData: claimRef ? {
      ...claimData,
      entries: { [cityId]: { providerPlaceId: canonicalPlaceId } },
    } : null,
    createCountry: !(await db.doc(`countries/${countryId}`).get()).exists,
    createCity: !(await db.doc(`countries/${countryId}/destinations/${cityId}`).get()).exists,
    place: exactPlaceFromBilingual(
      bilingual,
      bilingual.fetchedAt instanceof Date ? bilingual.fetchedAt : new Date()
    ),
    resolutionSource: canonicalMatch.source,
    providerCallCount: requestContext.count,
  }, resolvedCountry.countryCode);
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
    googleCache: {
      ...exactPlaceGoogleCacheFor({ he, en, fetchedAt }),
      addresses: { he: he.address || '', en: en.address || '' },
    },
  };
}

function serializeDestinationResolution(destination) {
  const normalized = normalizeDestinationForUse(destination);
  return {
    namingPolicyVersion: DESTINATION_NAMING_POLICY_VERSION,
    countryId: normalized.countryId,
    cityId: normalized.cityId,
    countryData: normalized.countryData,
    cityData: normalized.cityData,
    claimId: normalized.claimId || null,
    claimData: normalized.claimData || null,
    createCountry: normalized.createCountry === true,
    createCity: normalized.createCity === true,
    place: normalized.place || null,
    resolutionSource: normalized.resolutionSource || null,
  };
}

function destinationClientResponse(destination, incidentId) {
  return {
    status: 'resolved',
    incidentId,
    place: destination.place,
    destination: {
      country: {
        id: destination.countryId,
        name: destination.countryData.name || destination.countryId,
        code: destination.countryData.code || null,
      },
      city: {
        id: destination.cityId,
        name: destinationHebrewName(destination.cityData) || destination.cityId,
        googlePlaceId: destination.cityData.providerRefs?.googlePlaceId ||
          destination.cityData.providerIds?.googlePlaceIds?.[0] || null,
        destinationType: destination.cityData.destinationType || null,
        ...(destination.cityData.googleCache?.coordinates ||
          destination.cityData.identity?.coordinates || destination.cityData.coordinates
          ? { coordinates: destination.cityData.googleCache?.coordinates ||
              destination.cityData.identity?.coordinates || destination.cityData.coordinates }
          : {}),
      },
    },
    persisted: !destination.createCountry && !destination.createCity,
    resolutionSource: destination.resolutionSource,
    providerCallCount: destination.providerCallCount,
  };
}

async function createDestinationChoiceResolution({
  admin,
  auth,
  resolvedPlaceToken,
  incidentId,
  destinations,
  destinationCountryCode,
  providerCallCount,
  allowDestinationSearch = false,
  place = null,
}) {
  const resolutionId = `dcr_${crypto.randomBytes(18).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const choices = destinations.slice(0, 3).map((destination) => ({
    choiceId: `dc_${crypto.randomBytes(12).toString('base64url')}`,
    destinationResolution: serializeDestinationResolution(destination),
  }));
  const expectedCountryCode = String(
    destinationCountryCode || choices[0]?.destinationResolution?.countryData?.code ||
    choices[0]?.destinationResolution?.countryId || ''
  ).trim().toUpperCase();
  assert(/^[A-Z]{2}$/.test(expectedCountryCode), 'failed-precondition',
    'The destination country could not be verified. Search again.');
  await admin.firestore().doc(
    `system/runtime/destinationResolutionChoices/${resolutionId}`
  ).create({
    uid: auth.uid,
    resolvedPlaceToken,
    incidentId,
    providerCallCount,
    destinationCountryCode: expectedCountryCode,
    choices,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return {
    status: 'destination_choice_required',
    resolutionId,
    expiresAt,
    incidentId,
    alternatives: choices.map((choice) => {
      const stored = choice.destinationResolution;
      return {
        destinationChoiceId: choice.choiceId,
        countryId: stored.countryId,
        countryName: stored.countryData?.name || stored.countryId,
        cityId: stored.cityId,
        cityName: destinationHebrewName(stored.cityData) || stored.cityId,
        destinationType: stored.cityData?.destinationType || null,
      };
    }),
    allowDestinationSearch: allowDestinationSearch === true,
    providerCallCount,
    destinationCountryCode: expectedCountryCode,
    ...(place ? { place } : {}),
  };
}

async function finalizeDestinationChoice({
  admin,
  auth,
  data,
  providerRateLimitKey,
}) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'Email verification is required.');
  const resolutionId = cleanString(data?.resolutionId, {
    field: 'resolutionId', min: 8, max: 100,
  });
  const destinationChoiceId = data?.destinationChoiceId ? cleanString(data.destinationChoiceId, {
    field: 'destinationChoiceId', min: 8, max: 100,
  }) : '';
  const ref = admin.firestore().doc(
    `system/runtime/destinationResolutionChoices/${resolutionId}`
  );
  const snapshot = await ref.get();
  assert(snapshot.exists, 'not-found', 'The destination choice has expired. Search again.');
  const stored = snapshot.data() || {};
  assert(stored.uid === auth.uid, 'permission-denied', 'This destination choice belongs to another user.');
  assert(stored.expiresAt?.toDate?.().getTime() > Date.now(),
    'deadline-exceeded', 'The destination choice has expired. Search again.');
  const choice = destinationChoiceId
    ? (stored.choices || []).find((entry) => entry.choiceId === destinationChoiceId)
    : null;
  let destination;
  if (choice?.destinationResolution) {
    destination = await materializeDestinationResolution(
      admin.firestore(), choice.destinationResolution
    );
  } else if (data?.destinationRef) {
    destination = await resolveExistingDestination(admin.firestore(), data.destinationRef);
  } else if (data?.destinationResolvedPlaceToken) {
    const chosenResolvedPlace = await readResolvedPlaceToken({
      admin,
      auth,
      resolvedPlaceToken: data.destinationResolvedPlaceToken,
      providerRateLimitKey,
    });
    assert(chosenResolvedPlace.destinationResolution, 'failed-precondition',
      'Confirm the destination name before continuing.');
    destination = await materializeDestinationResolution(
      admin.firestore(), chosenResolvedPlace.destinationResolution
    );
  } else {
    assert(false, 'invalid-argument', 'The destination choice is invalid.');
  }
  const exactResolvedPlace = await readResolvedPlaceToken({
    admin,
    auth,
    resolvedPlaceToken: stored.resolvedPlaceToken,
    providerRateLimitKey,
  });
  const selectedCountryCode = String(
    destination?.countryData?.code || destination?.countryId || ''
  ).trim().toUpperCase();
  const expectedCountryCode = String(
    stored.destinationCountryCode ||
    stored.choices?.[0]?.destinationResolution?.countryData?.code ||
    stored.choices?.[0]?.destinationResolution?.countryId ||
    exactResolvedPlace?.en?.countryCode || exactResolvedPlace?.he?.countryCode || ''
  ).trim().toUpperCase();
  assert(/^[A-Z]{2}$/.test(selectedCountryCode) && /^[A-Z]{2}$/.test(expectedCountryCode),
    'failed-precondition', 'The destination country could not be verified. Search again.');
  assert(selectedCountryCode === expectedCountryCode, 'failed-precondition',
    'Choose a destination in the same country as the selected place.');
  const exactPlace = exactPlaceFromBilingual(
    exactResolvedPlace,
    exactResolvedPlace.fetchedAt instanceof Date ? exactResolvedPlace.fetchedAt : new Date()
  );
  assertPlaceMatchesDestinationGeometry(destination, exactPlace);
  const combinedDestination = {
    ...destination,
    place: exactPlace,
  };
  const combinedResolution = serializeDestinationResolution(combinedDestination);
  await storeResolvedPlaceDestination({
    admin,
    auth,
    resolvedPlaceToken: stored.resolvedPlaceToken,
    destinationResolution: combinedResolution,
    providerRateLimitKey,
    providerCallCount: Number(stored.providerCallCount || 0),
  });
  await ref.delete();
  return {
    ...destinationClientResponse(
      { ...combinedDestination, providerCallCount: Number(stored.providerCallCount || 0) },
      createIncidentId(stored.incidentId)
    ),
    resolvedPlaceToken: stored.resolvedPlaceToken,
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
  if (citySnapshot.exists && isDestinationReassigning(cityData)) {
    throw new HttpsError(
      'failed-precondition',
      'The destination is being reassigned. Try again shortly.',
      { reason: 'destination_reassignment_in_progress', retryable: true }
    );
  }
  if (citySnapshot.exists && !destinationAcceptsNewReferences(cityData) &&
      cityData.mergedInto?.countryId && cityData.mergedInto?.cityId) {
    const redirected = await resolveExistingDestination(db, cityData.mergedInto);
    return {
      ...redirected,
      place: stored.place || null,
      resolutionSource: 'merged_destination_redirect',
    };
  }
  assert(!countrySnapshot.exists || countryData.status === 'active', 'failed-precondition', 'The matching country is not active.');
  assert(!citySnapshot.exists || destinationAcceptsNewReferences(cityData), 'failed-precondition',
    'The matching destination is not available for new content.');
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
  return normalizeDestinationForUse({
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
  }, countryData.code || stored.countryId);
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
  selectionIntent = 'exact_place',
  confirmedHebrewName = null,
}) {
  const resolvedPlace = await readResolvedPlaceToken({
    admin, auth, resolvedPlaceToken, providerRateLimitKey,
  });
  const incidentId = createIncidentId(resolvedPlace.incidentId);
  const requestContext = providerRequestContext({
    count: Number(resolvedPlace.providerCallCount || 0),
    incidentId,
  });
  if (resolvedPlace.destinationResolution && !countryOverrideId) {
    const cached = await materializeDestinationResolution(
      admin.firestore(),
      resolvedPlace.destinationResolution
    );
    return { ...cached, incidentId, providerCallCount: requestContext.count };
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
    selectionIntent,
    confirmedHebrewName,
    requestContext,
  });
  if (destination?.requiresNameConfirmation) {
    return { ...destination, incidentId, providerCallCount: requestContext.count };
  }
  if (!countryOverrideId) {
    await storeResolvedPlaceDestination({
      admin,
      auth,
      resolvedPlaceToken,
      destinationResolution: serializeDestinationResolution(destination),
      providerRateLimitKey,
      providerCallCount: requestContext.count,
    });
  }
  return { ...destination, incidentId, providerCallCount: requestContext.count };
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
  incidentId,
  selectionIntent = 'exact_place',
  confirmedHebrewName = null,
}) {
  const effectiveIncidentId = createIncidentId(incidentId);
  if (resolvedPlaceToken) {
    try {
      return await resolveDestinationFromToken({
        admin, auth, resolvedPlaceToken, countryOverrideId, mapsKey,
        newPlacesKey, placesProvider, restCountriesKey, providerRateLimitKey,
        selectionIntent, confirmedHebrewName,
      });
    } catch (error) {
      if (!placeId || !isExpiredResolvedPlaceError(error)) throw error;
      locationLog('destination', {
        incidentId: effectiveIncidentId,
        outcome: 'fallback',
        durationMs: 0,
        reason: 'selection_expired',
        fallbackPath: 'raw_place_id',
      });
    }
  }
  if (!providerBudgetConsumed) {
    await consumeProviderBudget({
      admin,
      auth,
      action: 'fullResolution',
      key: providerRateLimitKey,
    });
  }
  const requestContext = providerRequestContext({ incidentId: effectiveIncidentId });
  const destination = await resolveGoogleDestination({
    admin, placeId, countryOverrideId, mapsKey, newPlacesKey, placesProvider,
    restCountriesKey, selectionIntent, confirmedHebrewName, requestContext,
  });
  return {
    ...destination,
    incidentId: effectiveIncidentId,
    providerCallCount: requestContext.count,
  };
}

async function resolveExactPlaceWithDestination({
  admin,
  auth,
  placeId,
  resolvedPlaceToken,
  destinationRef,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
  providerBudgetConsumed = false,
  incidentId,
}) {
  const cleanedDestinationRef = cleanRecommendationDestinationRef(destinationRef);
  const effectiveIncidentId = createIncidentId(incidentId);
  let resolvedPlace = null;
  let tokenIsUsable = false;
  if (resolvedPlaceToken) {
    try {
      resolvedPlace = await readResolvedPlaceToken({
        admin,
        auth,
        resolvedPlaceToken,
        providerRateLimitKey,
      });
      tokenIsUsable = true;
    } catch (error) {
      if (!placeId || !isExpiredResolvedPlaceError(error)) throw error;
      locationLog('destination', {
        incidentId: effectiveIncidentId,
        outcome: 'fallback',
        durationMs: 0,
        reason: 'selection_expired',
        fallbackPath: 'explicit_destination_binding',
      });
    }
  }

  let destination;
  if (resolvedPlace?.destinationResolution) {
    destination = await materializeDestinationResolution(
      admin.firestore(), resolvedPlace.destinationResolution
    );
    let expectedCountryId = cleanedDestinationRef.countryId;
    let expectedCityId = cleanedDestinationRef.cityId;
    if (destination.countryId !== expectedCountryId || destination.cityId !== expectedCityId) {
      const redirected = await resolveExistingDestination(
        admin.firestore(), cleanedDestinationRef
      );
      expectedCountryId = redirected.countryId;
      expectedCityId = redirected.cityId;
    }
    assert(
      destination.countryId === expectedCountryId &&
        destination.cityId === expectedCityId,
      'failed-precondition',
      'The verified destination does not match the selected destination. Search again.'
    );
  } else {
    destination = await resolveRecommendationDestinationRef({
      admin,
      auth,
      destinationRef: cleanedDestinationRef,
      mapsKey,
      newPlacesKey,
      placesProvider,
      restCountriesKey,
      providerRateLimitKey,
    });
  }

  const requestContext = providerRequestContext({
    count: Number(resolvedPlace?.providerCallCount || destination?.providerCallCount || 0),
    incidentId: effectiveIncidentId,
  });
  if (!resolvedPlace) {
    assert(placeId, 'invalid-argument', 'An exact place is required.');
    if (!providerBudgetConsumed) {
      await consumeProviderBudget({
        admin,
        auth,
        action: 'fullResolution',
        key: providerRateLimitKey,
      });
    }
    resolvedPlace = await fetchBilingualPlace({
      provider: placesProvider,
      placeId,
      mapsKey,
      newPlacesKey,
      requestContext,
    });
  }

  const parsedPlace = parseResolvedBilingualPlace(resolvedPlace);
  const resolvedCountry = await resolvePlaceCountry({
    parsedPlace,
    parsedCity: parsedPlace,
    mapsKey,
    requestContext,
  });
  const destinationCountryCode = String(
    destination.countryData?.code || destination.countryId || ''
  ).trim().toUpperCase();
  if (resolvedCountry.countryCode !== destinationCountryCode) {
    throw new HttpsError(
      'failed-precondition',
      'Choose a destination in the same country as the selected place.',
      { reason: 'country_mismatch', retryable: false }
    );
  }
  const exactPlace = exactPlaceFromBilingual(
    resolvedPlace,
    resolvedPlace.fetchedAt instanceof Date ? resolvedPlace.fetchedAt : new Date()
  );
  assert(!placeId || exactPlace.placeId === placeId,
    'failed-precondition', 'The verified place does not match the selected place. Search again.');
  assertPlaceMatchesDestinationGeometry(destination, exactPlace);
  const combinedDestination = {
    ...destination,
    place: exactPlace,
    incidentId: effectiveIncidentId,
    providerCallCount: requestContext.count,
  };
  if (tokenIsUsable) {
    await storeResolvedPlaceDestination({
      admin,
      auth,
      resolvedPlaceToken,
      destinationResolution: serializeDestinationResolution(combinedDestination),
      providerRateLimitKey,
      providerCallCount: requestContext.count,
    });
  }
  return combinedDestination;
}

async function resolveRecommendationDestinationInternal({
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
  try {
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
      incidentId: data?.incidentId,
      selectionIntent: data?.selectionIntent === 'destination' ? 'destination' : 'exact_place',
      confirmedHebrewName: data?.confirmedHebrewName || null,
    });
    if (destination?.requiresNameConfirmation) {
      return {
        status: 'destination_name_confirmation_required',
        incidentId: destination.incidentId || createIncidentId(data?.incidentId),
        place: destination.place,
        nameConfirmation: destination.nameConfirmation,
        providerCallCount: destination.providerCallCount,
      };
    }
    return destinationClientResponse(
      destination,
      destination.incidentId || createIncidentId(data?.incidentId)
    );
  } catch (error) {
    if (
      data?.supportsDestinationChoice === true &&
      data?.resolvedPlaceToken &&
      ((error?.destinationSelectionRequired === true && data?.supportsDestinationSearch === true) ||
        (Array.isArray(error?.destinationChoices) && error.destinationChoices.length > 1))
    ) {
      const selectedPlace = await readResolvedPlaceToken({
        admin,
        auth,
        resolvedPlaceToken: data.resolvedPlaceToken,
        providerRateLimitKey,
      });
      return createDestinationChoiceResolution({
        admin,
        auth,
        resolvedPlaceToken: data.resolvedPlaceToken,
        incidentId: createIncidentId(data?.incidentId),
        destinations: error.destinationChoices || [],
        destinationCountryCode: error.destinationCountryCode,
        providerCallCount: Number(error.providerCallCount || 0),
        allowDestinationSearch: true,
        place: exactPlaceFromBilingual(
          selectedPlace,
          selectedPlace.fetchedAt instanceof Date ? selectedPlace.fetchedAt : new Date()
        ),
      });
    }
    throw error;
  }
}

async function resolveRecommendationDestination(options) {
  const incidentId = createIncidentId(options?.data?.incidentId);
  const startedAt = Date.now();
  try {
    const result = await resolveRecommendationDestinationInternal({
      ...options,
      data: { ...(options?.data || {}), incidentId },
    });
    const effectiveIncidentId = result.incidentId || incidentId;
    locationLog('destination', {
      incidentId: effectiveIncidentId,
      outcome: 'succeeded',
      durationMs: Date.now() - startedAt,
      providerCalls: result.providerCallCount,
      fallbackPath: result.resolutionSource || result.status,
    });
    const { providerCallCount, ...clientResult } = result;
    return clientResult;
  } catch (error) {
    const effectiveIncidentId = error?.details?.incidentId || incidentId;
    const reason = reasonForLocationError(error, 'destination_resolution_failed');
    locationLog('destination', {
      incidentId: effectiveIncidentId,
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
      reason,
    });
    throw decorateLocationError(error, effectiveIncidentId, 'destination_resolution_failed');
  }
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
  resolveDestinationRef = resolveRecommendationDestinationRef,
  resolveExactPlace = resolveExactPlaceWithDestination,
  resolveExistingForEdit = resolveExistingDestination,
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
  const isAdmin = recommendationId
    ? await hasActiveAdminAccess({ admin, auth })
    : false;

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
        contentMode: replay.locationMode || 'destination',
        publicationStatus: publicationOutcome(replay.status).publicationStatus,
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
        ...publicationOutcome(replay.status),
        idempotentReplay: true,
      };
    }
  }

  if (recommendationId) {
    assert(previousSnap.exists, 'not-found', 'Recommendation does not exist.');
    assert(
      previousData.ownerId === uid || isAdmin,
      'permission-denied',
      'You do not own this recommendation.'
    );
  }

  assert(Number(data?.recommendation?.taxonomyVersion || 0) >= taxonomy.version,
    'failed-precondition', 'Update PlanLi to choose Free or Cheap as separate budget options.');

  const requestUsesRecommendationCatalog =
    data?.recommendation?.recommendationCatalogVersion != null ||
    Array.isArray(data?.recommendation?.subcategoryIds);
  const previousUsesRecommendationCatalog = Number(previousData?.recommendationCatalogVersion || 0) > 0;
  assert(
    !(recommendationId && previousUsesRecommendationCatalog && !requestUsesRecommendationCatalog),
    'failed-precondition',
    'Update PlanLi before editing this recommendation.'
  );
  const content = sanitizeRecommendationContent(data?.recommendation);
  const usesRecommendationCatalog = content.recommendationCatalogVersion > 0;
  const details = sanitizeRecommendationDetails(data?.recommendation?.details, content);
  const textSafety = evaluateTextSafety([
    content.title,
    content.description,
    ...Object.values(details),
    content.customSubcategoryLabel,
  ]);
  const attributes = usesRecommendationCatalog
    ? { audienceScope: 'all', audiences: [], vibes: [], environments: [], needs: [] }
    : sanitizeRecommendationAttributes(
        data?.recommendation?.attributes,
        content,
        {
          legacyFacets: data?.recommendation?.facets,
          taxonomyVersion: data?.recommendation?.taxonomyVersion,
        }
      );
  const baseFacets = buildRecommendationFacets(
      {
        ...content,
        tags: Number(data?.recommendation?.taxonomyVersion || 0) >= 4
          ? content.tags
          : data?.recommendation?.tags || [],
      },
      attributes
    );
  const facets = usesRecommendationCatalog
    ? {
        ...baseFacets,
        interests: Array.from(new Set([
          ...(baseFacets.interests || []),
          ...(content.catalogInterestIds || []),
        ])),
        catalogInterests: content.catalogInterestIds,
      }
    : baseFacets;
  const media = await validateMediaAssets({
    admin,
    uid,
    media: data?.recommendation?.media,
    mediaBucket,
    existingMedia: previousData?.media,
  });
  const locationMode = cleanOptionalString(data?.locationMode, { field: 'locationMode', max: 20 });
  assert(!locationMode || ['exact', 'destination', 'pin'].includes(locationMode),
    'invalid-argument', 'locationMode is invalid.');
  assert(!usesRecommendationCatalog || locationMode,
    'invalid-argument', 'locationMode is required.');
  let destination;
  if (data?.destinationRef) {
    const trustedExactEdit = recommendationId
      ? await resolveUnchangedExactRecommendation({
          db,
          locationMode,
          placeId: data?.placeId,
          destinationRef: data.destinationRef,
          previousData,
          resolveExisting: resolveExistingForEdit,
        })
      : null;
    const hasSubmittedExactPlace = locationMode === 'exact' &&
      Boolean(data?.resolvedPlaceToken || data?.placeId);
    destination = trustedExactEdit || (hasSubmittedExactPlace
      ? await resolveExactPlace({
          admin,
          auth,
          placeId: data?.placeId,
          resolvedPlaceToken: data?.resolvedPlaceToken,
          destinationRef: data.destinationRef,
          mapsKey,
          newPlacesKey,
          placesProvider,
          restCountriesKey,
          providerRateLimitKey,
          incidentId: data?.incidentId,
        })
      : await resolveDestinationRef({
          admin,
          auth,
          destinationRef: data.destinationRef,
          mapsKey,
          newPlacesKey,
          placesProvider,
          restCountriesKey,
          providerRateLimitKey,
        }));
    if (usesRecommendationCatalog && locationMode === 'pin') {
      assert(data?.manualLocation, 'invalid-argument', 'A map pin is required for pin mode.');
    }
    if (usesRecommendationCatalog && locationMode === 'exact' && !destination.place?.placeId) {
      assert(
        recommendationId &&
          previousData?.place?.placeId &&
          previousData?.destination?.countryId === destination.countryId &&
          previousData?.destination?.cityId === destination.cityId,
        'invalid-argument',
        'An exact place is required for exact mode.'
      );
    }
    if (data?.manualLocation) {
      assert(locationMode === 'pin', 'invalid-argument', 'manualLocation requires pin mode.');
      destination.place = manualPlaceForDestination(data.manualLocation, destination);
    } else if (
      !destination.place?.placeId &&
      recommendationId &&
      locationMode !== 'destination' &&
      previousData?.place?.placeId &&
      previousData?.destination?.countryId === destination.countryId &&
      previousData?.destination?.cityId === destination.cityId
    ) {
      destination.place = previousData.place;
    }
    if (usesRecommendationCatalog && locationMode === 'destination') {
      destination.place = null;
    }
  } else {
    assert(!usesRecommendationCatalog || locationMode === 'exact',
      'invalid-argument', 'An exact location is required for this location mode.');
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
      incidentId: data?.incidentId,
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
      cityName: destinationHebrewName(destination.cityData) || destination.cityId,
    },
    media,
    details,
    locationMode: locationMode || (destination.place?.placeId ? 'exact' : 'destination'),
    place: destination.place,
    mapLocation: buildMapLocation(destination.place?.coordinates),
  };
  payload.search = buildSearchIndex({
    title: content.title,
    description: content.description,
    destination: payload.destination,
    place: payload.place,
    categoryIds: [content.categoryId],
    subcategoryIds: content.subcategoryIds || content.tags,
    interestIds: Array.from(new Set([...(facets.interests || []), ...(content.catalogInterestIds || [])])),
  });
  const moderationHoldReason = !textSafety.safe ? textSafety.reason : '';

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
    const canonicalCity = citySnapshot.exists
      ? normalizeDestinationHebrewData(citySnapshot.data(), {
        countryCode: countrySnapshot.data()?.code || destination.countryId,
      })
      : {
        destination: destination.cityData,
        name: destinationHebrewName(destination.cityData),
        changed: false,
      };
    assert(hasHebrewName(canonicalCity.name), 'failed-precondition',
      'The destination has no trustworthy Hebrew name.');
    const transactionDestination = {
      ...payload.destination,
      cityName: canonicalCity.name,
    };
    const transactionPayload = canonicalCity.name === payload.destination.cityName
      ? payload
      : {
        ...payload,
        destination: transactionDestination,
        search: buildSearchIndex({
          title: content.title,
          description: content.description,
          destination: transactionDestination,
          place: payload.place,
          categoryIds: [content.categoryId],
          subcategoryIds: content.subcategoryIds || content.tags,
          interestIds: Array.from(new Set([...(facets.interests || []), ...(content.catalogInterestIds || [])])),
        }),
      };
    if (recommendationId) {
      assert(current.exists, 'not-found', 'Recommendation no longer exists.');
      assert(
        currentData.ownerId === uid || isAdmin,
        'permission-denied',
        'Recommendation ownership changed.'
      );
    }
    assert(
      !previousCitySnapshot?.exists || !isDestinationReassigning(previousCitySnapshot.data()),
      'failed-precondition',
      'The recommendation destination is being reassigned. Try again shortly.'
    );

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
        destinationAcceptsNewReferences(citySnapshot.data()),
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
      if (canonicalCity.changed) {
        transaction.update(destination.cityRef, {
          ...destinationHebrewWritePatch(canonicalCity.destination),
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

    const existingStatus = currentData?.status || 'active';
    const releasesLegacyTaxonomyHold = existingStatus === 'moderation_hold'
      && currentData?.moderation?.holdReason === 'taxonomy_other'
      && !moderationHoldReason;
    const nextStatus = moderationHoldReason && existingStatus === 'active'
      ? 'moderation_hold'
      : releasesLegacyTaxonomyHold
        ? 'active'
        : existingStatus;
    if (recommendationId) {
      transaction.update(recommendationRef, {
        ...transactionPayload,
        status: nextStatus,
        ...(moderationHoldReason
          ? { moderation: { holdReason: moderationHoldReason } }
          : releasesLegacyTaxonomyHold
            ? { moderation: admin.firestore.FieldValue.delete() }
            : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      transaction.create(recommendationRef, {
        ...transactionPayload,
        status: moderationHoldReason ? 'moderation_hold' : 'active',
        ...(moderationHoldReason ? { moderation: { holdReason: moderationHoldReason } } : {}),
        ownerId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        stats: { likeCount: 0, commentCount: 0 },
      });
    }
    return { replay: false, destination: transactionPayload.destination, status: nextStatus };
  });

  console.info('recommendation_save_timing', {
    durationMs: Date.now() - saveStartedAt,
    imageCount: media.length,
    replay: transactionOutcome?.replay === true,
    contentMode: payload.locationMode,
    publicationStatus: publicationOutcome(
      transactionOutcome?.data?.status || transactionOutcome?.status
    ).publicationStatus,
  });
  const responseDestination = transactionOutcome?.data?.destination || transactionOutcome?.destination || {
    countryId: destination.countryId,
    countryName: destination.countryData.name || destination.countryId,
    cityId: destination.cityId,
    cityName: destinationHebrewName(destination.cityData) || destination.cityId,
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
    ...publicationOutcome(transactionOutcome?.data?.status || transactionOutcome?.status),
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
  findExistingDestinationByAlias,
  finalizeDestinationChoice,
  resolvePlaceCountry,
  resolveGoogleDestination,
  resolveDestinationFromToken,
  resolveExactPlaceWithDestination,
  resolveSubmittedPlaceDestination,
  resolveRecommendationDestinationRef,
  resolveUnchangedExactRecommendation,
  resolveRecommendationDestination,
  resolveExistingDestination,
  sanitizeRecommendationContent,
  sanitizeRecommendationCatalogContent,
  sanitizeRecommendationDetails,
  sanitizeRecommendationAttributes,
  sanitizeSubmittedFacets,
  saveRecommendation,
  stableDocumentId,
  normalizePublishRequestId,
  normalizeExternalUrl,
  validateMediaAssets,
  destinationHebrewWritePatch,
  normalizeDestinationForUse,
};
