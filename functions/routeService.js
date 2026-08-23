const { HttpsError } = require('firebase-functions/v2/https');
const { hasActiveAdminAccess } = require('./adminAuthorization');
const { evaluateTextSafety } = require('./moderationService');
const {
  isVerifiedCaller,
  destinationHebrewWritePatch,
  normalizePublishRequestId,
  resolveExistingDestination,
  resolveSubmittedPlaceDestination,
  stableDocumentId,
  validateMediaAssets,
} = require('./recommendationService');
const {
  destinationHebrewName,
  hasHebrewName,
  normalizeDestinationHebrewData,
} = require('./destinationLocalizationService');
const { normalizeRouteTime } = require('./routeTime');
const {
  buildTravelContentFacets,
  CATEGORY_IDS,
  ENVIRONMENT_IDS,
  INTEREST_IDS,
  NEED_IDS,
  normalizeAliasedId,
  normalizeBudget,
  normalizeCategoryIds,
  normalizeRecommendationCategory,
  normalizeRecommendationSubcategories,
  normalizeRecommendationTags,
  PACE_IDS,
	POST_BUDGET_IDS,
  ROUTE_DIFFICULTY_IDS,
  ROUTE_EXPERIENCE_IDS,
  SEASON_IDS,
  TAG_IDS,
  tagsMatchCategory,
  taxonomy,
  TRANSPORT_MODE_IDS,
  TRAVELER_STYLE_IDS,
  TRAVEL_PARTY_IDS,
  uniqueAllowed,
  VIBE_IDS,
} = require('./travelTaxonomy');
const { buildSearchIndex, destinationKey } = require('./discoverySearch');
const { consumeProviderBudget } = require('./providerRateLimitService');
const { attachRouteDestinationPreviews } = require('./routeDestinationPreviewService');

const MAX_ROUTE_DAYS = 60;
const MAX_ROUTE_STOPS = 150;
const MAX_ROUTE_MEDIA = 40;
const MAX_ROUTE_PLACES = 50;
const MAX_ROUTE_DESTINATIONS = 20;
const MAX_PROVIDER_RESOLUTIONS_PER_SAVE = 5;
const PREPARED_REVISION_TTL_MS = 2 * 60 * 60 * 1000;
const SUPERSEDED_REVISION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanString(value, field, { min = 0, max = 5000 } = {}) {
  assert(typeof value === 'string', 'invalid-argument', `${field} must be a string.`);
  const result = value.trim();
  assert(result.length >= min && result.length <= max, 'invalid-argument', `${field} is invalid.`);
  return result;
}

function cleanOptionalString(value, field, max = 500) {
  if (value == null || value === '') return '';
  return cleanString(value, field, { max });
}

function cleanDocumentId(value, field, fallback) {
  const result = cleanOptionalString(value, field, 180) || fallback;
  assert(!result.includes('/'), 'invalid-argument', `${field} is invalid.`);
  return result;
}

function cleanCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  assert(
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
      Number.isFinite(lng) && lng >= -180 && lng <= 180,
    'invalid-argument',
    'Every route stop requires valid coordinates.'
  );
  return { lat, lng };
}

function cleanOptionalCoordinates(value) {
  if (value == null || value === '') return null;
  return cleanCoordinates(value);
}

function cleanDestinationRef(value, field = 'destination') {
  if (value == null) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', `${field} is invalid.`);
  const providerPlaceId = cleanOptionalString(value.providerPlaceId, `${field}.providerPlaceId`, 300);
  const resolvedPlaceToken = providerPlaceId
    ? cleanOptionalString(value.resolvedPlaceToken, `${field}.resolvedPlaceToken`, 300)
    : '';
  return {
    countryId: cleanString(value.countryId, `${field}.countryId`, { min: 1, max: 180 }),
    cityId: cleanString(value.cityId, `${field}.cityId`, { min: 1, max: 180 }),
    countryName: cleanOptionalString(value.countryName, `${field}.countryName`, 200),
    cityName: cleanOptionalString(value.cityName || value.name, `${field}.cityName`, 200),
    ...(providerPlaceId ? {
      provider: 'google',
      providerPlaceId,
      ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
    } : {}),
  };
}

function sanitizePlace(value, fallbackCoordinates, { requirePlaceId = false } = {}) {
  const place = value && typeof value === 'object' ? value : {};
  const placeId = cleanOptionalString(place.placeId, 'place.placeId', 300);
  const resolvedPlaceToken = cleanOptionalString(place.resolvedPlaceToken, 'place.resolvedPlaceToken', 300);
  assert(!requirePlaceId || placeId, 'invalid-argument', 'Every route stop requires a verified Place ID.');
  const coordinates = cleanOptionalCoordinates(place.coordinates || fallbackCoordinates);
  assert(!requirePlaceId || coordinates, 'invalid-argument', 'Every route stop requires valid coordinates.');
  if (!placeId && !coordinates && !place.name && !place.address) return null;
  return {
    placeId,
    ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
    name: cleanOptionalString(place.name, 'place.name', 200),
    address: cleanOptionalString(place.address, 'place.address', 500),
    ...(coordinates ? { coordinates } : {}),
  };
}

function normalizeLocationPrecision(value, { place, coordinates, destination, strict }) {
  const inferred = place?.placeId ? 'exact' : coordinates ? 'pin' : destination ? 'general' : '';
  const precision = cleanOptionalString(value, 'locationPrecision', 20) || inferred;
  assert(['exact', 'pin', 'general'].includes(precision),
    'invalid-argument', 'locationPrecision is invalid.');
  if (precision === 'exact') {
    assert(place?.placeId && place?.coordinates, 'invalid-argument', 'An exact route stop requires a verified place.');
  } else if (precision === 'pin') {
    assert(coordinates && destination, 'invalid-argument', 'A pinned route stop requires coordinates and a destination.');
  } else {
    assert(destination, 'invalid-argument', 'A general route stop requires a destination.');
  }
  assert(!strict || precision === 'exact', 'invalid-argument', 'Every route stop requires a verified Place ID.');
  return precision;
}

function cleanOptionalTime(value, field) {
  const result = normalizeRouteTime(cleanOptionalString(value, field, 5));
  assert(result !== null,
    'invalid-argument', `${field} is invalid.`);
  return result;
}

function cleanOptionalDuration(value, field) {
  if (value == null || value === '') return null;
  const result = Number(value);
  assert(Number.isSafeInteger(result) && result >= 1 && result <= 1440,
    'invalid-argument', `${field} is invalid.`);
  return result;
}

function cleanEnumArray(value, field, allowed, maximum, { minimum = 0 } = {}) {
  assert(Array.isArray(value), 'invalid-argument', `${field} must be an array.`);
  assert(value.length >= minimum && value.length <= maximum, 'invalid-argument', `${field} is invalid.`);
  assert(value.every((entry) => typeof entry === 'string' && allowed.includes(entry)),
    'invalid-argument', `${field} is invalid.`);
  return uniqueAllowed(value, allowed, maximum);
}

function legacyRouteMetadata(input) {
  const tags = input.tags && typeof input.tags === 'object' ? input.tags : {};
  const partyAliases = taxonomy.legacy?.partyAliases || {};
  const styleAliases = taxonomy.legacy?.travelerStyleAliases || {};
  const rawExperience = Array.isArray(tags.experience) ? tags.experience : [];
  const rawRoadTrip = Array.isArray(tags.roadTrip) ? tags.roadTrip : [];
  const audience = partyAliases[tags.travelStyle];
  const travelerStyle = styleAliases[tags.travelStyle];
  const vibes = rawExperience.map((value) => taxonomy.legacy?.vibeAliases?.[value] || value);
  return {
    difficulty: normalizeAliasedId(
      tags.difficulty,
      ROUTE_DIFFICULTY_IDS,
      taxonomy.legacy?.routeDifficultyAliases
    ) || 'moderate',
    experienceLevel: rawExperience.map((value) => normalizeAliasedId(
      value,
      ROUTE_EXPERIENCE_IDS,
      taxonomy.legacy?.routeExperienceAliases
    )).find(Boolean) || '',
    transportModes: ['mixed'],
    pace: '',
    categoryIds: rawRoadTrip.length ? ['nature'] : [],
    subcategoryIds: [],
    facets: {
      interests: rawRoadTrip.length ? ['scenic_roadtrips'] : ['local_experiences'],
      audiences: audience ? [audience] : ['friends'],
      vibes: uniqueAllowed(vibes, VIBE_IDS, 4),
      travelerStyles: travelerStyle ? [travelerStyle] : rawRoadTrip.length ? ['roadtrip'] : [],
      needs: [],
      budgetLevel: 'flexible',
      seasons: [],
      environments: [],
    },
  };
}

function sanitizeStreamlinedRouteMetadata(input) {
  const categoryIds = normalizeCategoryIds(input.categoryIds || []);
  assert(categoryIds.length === (input.categoryIds || []).length,
    'invalid-argument', 'categoryIds are invalid.');
  const subcategoryIds = normalizeRecommendationTags(input.subcategoryIds || []);
  assert(subcategoryIds.length === (input.subcategoryIds || []).length,
    'invalid-argument', 'subcategoryIds are invalid.');
  assert(subcategoryIds.every((tagId) =>
    categoryIds.some((categoryId) => tagsMatchCategory([tagId], categoryId))),
  'invalid-argument', 'subcategoryIds do not match categoryIds.');

  const submitted = input.attributes && typeof input.attributes === 'object'
    ? input.attributes
    : {};
  const allowedFields = [
    'audienceScope', 'audiences', 'vibes', 'travelerStyles', 'needs',
    'needsCoverageConfirmed', 'budgetLevel', 'seasons', 'environment',
  ];
  assert(Object.keys(submitted).every((key) => allowedFields.includes(key)),
    'invalid-argument', 'Route attributes contain unsupported fields.');
  const budgetLevel = normalizeBudget(submitted.budgetLevel);
  assert(POST_BUDGET_IDS.includes(budgetLevel),
    'invalid-argument', 'attributes.budgetLevel is required.');
  const audienceScope = submitted.audienceScope === 'selected' ? 'selected' : 'all';
  const audiences = cleanEnumArray(
    submitted.audiences || [], 'attributes.audiences', TRAVEL_PARTY_IDS, 6
  );
  assert(audienceScope !== 'selected' || audiences.length > 0,
    'invalid-argument', 'Choose at least one audience or use everyone.');
  assert(audienceScope !== 'all' || audiences.length === 0,
    'invalid-argument', 'Universal routes cannot select audiences.');
  const needs = cleanEnumArray(submitted.needs || [], 'attributes.needs', NEED_IDS, NEED_IDS.length);
  assert(!needs.length || submitted.needsCoverageConfirmed === true,
    'invalid-argument', 'Route needs must be confirmed for the entire route.');
  const seasons = cleanEnumArray(
    submitted.seasons || [], 'attributes.seasons', SEASON_IDS, SEASON_IDS.length
  );
  const environment = cleanOptionalString(submitted.environment, 'attributes.environment', 40);
  assert(!environment || ENVIRONMENT_IDS.includes(environment),
    'invalid-argument', 'attributes.environment is invalid.');
  const vibes = cleanEnumArray(submitted.vibes || [], 'attributes.vibes', VIBE_IDS, 4);
  const travelerStyles = cleanEnumArray(
    submitted.travelerStyles || [], 'attributes.travelerStyles', TRAVELER_STYLE_IDS, 4
  );
  const facets = buildTravelContentFacets({ categoryIds, subcategoryIds, budget: budgetLevel }, {
    audienceScope,
    audiences,
    vibes,
    travelerStyles,
    needs,
    seasons,
    environments: environment ? [environment] : [],
  }, { surface: 'route' });
  facets.budgetLevel = budgetLevel;

  const difficulty = input.difficulty
    ? normalizeAliasedId(input.difficulty, ROUTE_DIFFICULTY_IDS, taxonomy.legacy?.routeDifficultyAliases)
    : '';
  assert(!input.difficulty || difficulty, 'invalid-argument', 'difficulty is invalid.');
  const experienceLevel = input.experienceLevel
    ? normalizeAliasedId(input.experienceLevel, ROUTE_EXPERIENCE_IDS, taxonomy.legacy?.routeExperienceAliases)
    : '';
  assert(!input.experienceLevel || experienceLevel, 'invalid-argument', 'experienceLevel is invalid.');
  const transportModes = (input.transportModes || []).map((value) => normalizeAliasedId(
    value, TRANSPORT_MODE_IDS, taxonomy.legacy?.transportModeAliases
  ));
  assert(transportModes.every(Boolean), 'invalid-argument', 'transportModes are invalid.');
  const pace = input.pace ? normalizeAliasedId(input.pace, PACE_IDS) : '';
  assert(!input.pace || pace, 'invalid-argument', 'pace is invalid.');
  return {
    categoryIds,
    subcategoryIds,
    facets,
    difficulty,
    experienceLevel,
    transportModes: uniqueAllowed(transportModes, TRANSPORT_MODE_IDS, 4),
    pace,
    priceBasis: 'whole_route',
    priceNote: cleanOptionalString(input.priceNote, 'priceNote', 120),
  };
}

function sanitizeRouteMetadata(input) {
  if (Number(input.routeSchemaVersion || 0) >= 2) {
    return sanitizeStreamlinedRouteMetadata(input);
  }
  const canonical = Number(input.taxonomyVersion || 0) >= 3;
  const strict = Number(input.taxonomyVersion || 0) >= 4;
  if (!canonical) return legacyRouteMetadata(input);
  const categoryIds = normalizeCategoryIds(input.categoryIds || []);
  assert(categoryIds.length === (input.categoryIds || []).length, 'invalid-argument', 'categoryIds are invalid.');
  assert(!strict || categoryIds.length >= 1, 'invalid-argument', 'Choose at least one route category.');
  const subcategoryIds = normalizeRecommendationTags(input.subcategoryIds || []);
  assert(subcategoryIds.length === (input.subcategoryIds || []).length, 'invalid-argument', 'subcategoryIds are invalid.');
  assert(subcategoryIds.every((tagId) => categoryIds.some((categoryId) => tagsMatchCategory([tagId], categoryId))),
    'invalid-argument', 'subcategoryIds do not match categoryIds.');
  assert(!strict || categoryIds.every((categoryId) =>
    subcategoryIds.some((tagId) => tagsMatchCategory([tagId], categoryId))),
  'invalid-argument', 'Choose at least one subcategory for every route category.');
  const submitted = strict
    ? (input.attributes && typeof input.attributes === 'object' ? input.attributes : {})
    : (input.facets && typeof input.facets === 'object' ? input.facets : {});
  const allowedFacetFields = strict
    ? ['audienceScope', 'audiences', 'vibes', 'travelerStyles', 'needs', 'needsCoverageConfirmed',
      'budgetLevel', 'seasons', 'environment']
    : ['interests', 'audiences', 'vibes', 'travelerStyles', 'needs', 'budgetLevel', 'seasons', 'environments'];
  assert(Object.keys(submitted).every((key) => allowedFacetFields.includes(key)),
    'invalid-argument', 'Route attributes contain unsupported fields.');
  const audiences = cleanEnumArray(
    submitted.audiences || [], 'attributes.audiences', TRAVEL_PARTY_IDS, 6,
    { minimum: strict ? (submitted.audienceScope === 'all' ? 0 : 1) : 1 }
  );
  const audienceScope = strict && submitted.audienceScope === 'all' ? 'all' : 'selected';
  assert(!strict || ['all', 'selected'].includes(submitted.audienceScope),
    'invalid-argument', 'attributes.audienceScope is invalid.');
  assert(audienceScope !== 'all' || audiences.length === 0,
    'invalid-argument', 'Universal routes cannot select audiences.');
  const needs = cleanEnumArray(submitted.needs || [], 'attributes.needs', NEED_IDS, NEED_IDS.length);
  assert(!strict || !needs.length || submitted.needsCoverageConfirmed === true,
    'invalid-argument', 'Route needs must be confirmed for the entire route.');
  const seasons = cleanEnumArray(
    submitted.seasons || [], 'attributes.seasons', SEASON_IDS, SEASON_IDS.length,
    { minimum: strict ? 1 : 0 }
  );
  const environment = strict
    ? cleanOptionalString(submitted.environment, 'attributes.environment', 40)
    : '';
  assert(!strict || ENVIRONMENT_IDS.includes(environment),
    'invalid-argument', 'attributes.environment is required.');
  const facets = buildTravelContentFacets({
    categoryIds,
    subcategoryIds,
    budget: normalizeBudget(submitted.budgetLevel),
  }, {
    audienceScope,
    audiences,
    vibes: cleanEnumArray(submitted.vibes || [], 'attributes.vibes', VIBE_IDS, 4),
    travelerStyles: cleanEnumArray(
      submitted.travelerStyles || [], 'attributes.travelerStyles', TRAVELER_STYLE_IDS, 4
    ),
    needs,
    seasons,
    environments: strict
      ? [environment]
      : cleanEnumArray(submitted.environments || [], 'facets.environments', ENVIRONMENT_IDS, ENVIRONMENT_IDS.length),
  }, { surface: 'route' });
  const budgetLevel = normalizeBudget(submitted.budgetLevel);
  assert(budgetLevel, 'invalid-argument', 'facets.budgetLevel is required.');
	assert(!strict || POST_BUDGET_IDS.includes(budgetLevel),
	  'invalid-argument', 'attributes.budgetLevel is invalid.');
  facets.budgetLevel = budgetLevel;
  const difficulty = normalizeAliasedId(input.difficulty, ROUTE_DIFFICULTY_IDS, taxonomy.legacy?.routeDifficultyAliases);
  assert(difficulty, 'invalid-argument', 'difficulty is required.');
  const experienceLevel = input.experienceLevel
    ? normalizeAliasedId(input.experienceLevel, ROUTE_EXPERIENCE_IDS, taxonomy.legacy?.routeExperienceAliases)
    : '';
  assert(!input.experienceLevel || experienceLevel, 'invalid-argument', 'experienceLevel is invalid.');
  const transportModes = (input.transportModes || []).map((value) => normalizeAliasedId(
    value, TRANSPORT_MODE_IDS, taxonomy.legacy?.transportModeAliases
  ));
  assert(transportModes.every(Boolean), 'invalid-argument', 'transportModes are invalid.');
  const cleanTransportModes = uniqueAllowed(transportModes, TRANSPORT_MODE_IDS, 4);
  assert(cleanTransportModes.length >= 1, 'invalid-argument', 'Choose at least one transport mode.');
  const pace = input.pace ? normalizeAliasedId(input.pace, PACE_IDS) : '';
  assert(!input.pace || pace, 'invalid-argument', 'pace is invalid.');
  assert(!strict || pace, 'invalid-argument', 'pace is required.');
  return {
    categoryIds,
    subcategoryIds,
    facets,
    difficulty,
    experienceLevel,
    transportModes: cleanTransportModes,
    pace,
  };
}

function sanitizeRouteInput(input) {
  assert(input && typeof input === 'object', 'invalid-argument', 'Missing route data.');
  const streamlined = Number(input.routeSchemaVersion || 0) >= 2;
  const strict = !streamlined && Number(input.taxonomyVersion || 0) >= 3;
  const days = Array.isArray(input.days) ? input.days : [];
  assert(days.length >= 1 && days.length <= MAX_ROUTE_DAYS, 'invalid-argument', 'Route days are invalid.');
  let totalStops = 0;
  const sanitizedDays = days.map((day, dayIndex) => {
    const stops = Array.isArray(day?.stops) ? day.stops : [];
    assert(!streamlined || stops.length >= 1,
      'invalid-argument', 'Every published route day requires at least one stop.');
    totalStops += stops.length;
    const sanitizedStops = stops.map((stop, stopIndex) => {
      const destination = cleanDestinationRef(
        stop?.destination || stop?.destinationRef,
        `days[${dayIndex}].stops[${stopIndex}].destination`
      );
      const place = sanitizePlace(stop?.place, stop?.coordinates, { requirePlaceId: strict });
      const coordinates = cleanOptionalCoordinates(stop?.coordinates || place?.coordinates);
      const locationPrecision = normalizeLocationPrecision(stop?.locationPrecision, {
        place,
        coordinates,
        destination,
        strict,
      });
      const canonicalCoordinates = locationPrecision === 'general' ? null : coordinates;
      const canonicalPlace = locationPrecision === 'general'
        ? null
        : locationPrecision === 'pin' && place
          ? {
              placeId: '',
              name: place.name,
              address: place.address,
              ...(canonicalCoordinates ? { coordinates: canonicalCoordinates } : {}),
            }
          : place;
      const recommendationId = cleanOptionalString(
        stop?.source?.recommendationId || stop?.recommendationId,
        `days[${dayIndex}].stops[${stopIndex}].recommendationId`,
        180
      );
      const additionalMedia = stop?.additionalMedia == null ? [] : stop.additionalMedia;
      assert(Array.isArray(additionalMedia) && additionalMedia.length <= 2,
        'invalid-argument', 'A route stop supports up to three images.');
      return {
        id: cleanDocumentId(stop?.id, `days[${dayIndex}].stops[${stopIndex}].id`, `stop_${String(stopIndex + 1).padStart(3, '0')}`),
        position: stopIndex,
        title: cleanString(stop?.title, `days[${dayIndex}].stops[${stopIndex}].title`, { min: 1, max: 160 }),
        description: cleanOptionalString(stop?.description, `days[${dayIndex}].stops[${stopIndex}].description`, 3000),
        location: cleanOptionalString(stop?.location, `days[${dayIndex}].stops[${stopIndex}].location`, 200),
        country: cleanOptionalString(stop?.country, `days[${dayIndex}].stops[${stopIndex}].country`, 200),
        locationPrecision,
        ...(destination ? { destination } : {}),
        ...(canonicalPlace ? { place: canonicalPlace } : {}),
        ...(canonicalCoordinates ? { coordinates: canonicalCoordinates } : {}),
        ...(recommendationId ? { source: { type: 'recommendation', recommendationId } } : {}),
        startTime: cleanOptionalTime(stop?.startTime, `days[${dayIndex}].stops[${stopIndex}].startTime`),
        durationMinutes: cleanOptionalDuration(
          stop?.durationMinutes,
          `days[${dayIndex}].stops[${stopIndex}].durationMinutes`
        ),
        subcategoryIds: [],
        reuseSavedLocation: stop?.reuseSavedLocation === true,
        media: stop?.media || null,
        additionalMedia,
      };
    });
    return {
      id: `day_${String(dayIndex + 1).padStart(3, '0')}`,
      position: dayIndex,
      description: cleanOptionalString(day?.description, `days[${dayIndex}].description`, 5000),
      media: day?.media || null,
      stops: sanitizedStops,
    };
  });
  assert(totalStops >= (streamlined ? 2 : 1) && totalStops <= MAX_ROUTE_STOPS,
    'invalid-argument', 'Route stops are invalid.');
  const distanceKm = streamlined ? 0 : Number(input.distanceKm);
  assert(Number.isFinite(distanceKm) && distanceKm >= 0, 'invalid-argument', 'distanceKm is invalid.');
  return {
    routeSchemaVersion: streamlined ? 2 : 1,
    title: cleanString(input.title, 'title', { min: 1, max: 120 }),
    description: cleanString(input.description, 'description', { min: 1, max: 5000 }),
    dayCount: sanitizedDays.length,
    distanceKm,
    ...sanitizeRouteMetadata(input),
    days: sanitizedDays,
  };
}

function collectMedia(days) {
  const unique = new Map();
  days.forEach((day) => {
    if (day.media?.assetId) unique.set(day.media.assetId, day.media);
    day.stops.forEach((stop) => {
      if (stop.media?.assetId) unique.set(stop.media.assetId, stop.media);
      (stop.additionalMedia || []).forEach((asset) => {
        if (asset?.assetId) unique.set(asset.assetId, asset);
      });
    });
  });
  return Array.from(unique.values());
}

function replaceValidatedMedia(days, validated) {
  const byId = new Map(validated.map((asset) => [asset.assetId, asset]));
  return days.map((day) => ({
    ...day,
    media: day.media?.assetId ? byId.get(day.media.assetId) || null : null,
    stops: day.stops.map((stop) => ({
      ...stop,
      media: stop.media?.assetId ? byId.get(stop.media.assetId) || null : null,
      additionalMedia: (stop.additionalMedia || [])
        .map((asset) => byId.get(asset?.assetId))
        .filter(Boolean),
    })),
  }));
}

function stopCoordinates(stop) {
  if (stop?.locationPrecision === 'general') return null;
  const value = stop?.place?.coordinates || stop?.coordinates;
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceBetweenKm(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latDelta = radians(right.lat - left.lat);
  const lngDelta = radians(right.lng - left.lng);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(left.lat)) * Math.cos(radians(right.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function attachRouteLegEstimates(days, transportModes = []) {
  const speedByMode = {
    walking: 4.5,
    bicycle: 15,
    cycling: 15,
    car: 50,
    public_transport: 30,
    public_transit: 30,
    motorcycle: 45,
    mixed: 35,
  };
  const speed = speedByMode[transportModes[0]] || 35;
  let totalDistance = 0;
  const output = days.map((day) => ({
    ...day,
    stops: day.stops.map((stop, index, stops) => {
      if (index === 0) return { ...stop, travelFromPrevious: null };
      const previousCoordinates = stopCoordinates(stops[index - 1]);
      const currentCoordinates = stopCoordinates(stop);
      if (!previousCoordinates || !currentCoordinates) {
        return { ...stop, travelFromPrevious: null };
      }
      const distanceKm = Math.round(distanceBetweenKm(previousCoordinates, currentCoordinates) * 10) / 10;
      totalDistance += distanceKm;
      return {
        ...stop,
        travelFromPrevious: {
          distanceKm,
          estimatedDurationMinutes: Math.max(1, Math.round(distanceKm / speed * 60)),
          estimated: true,
        },
      };
    }),
  }));
  return {
    days: output,
    distanceKm: Math.round(totalDistance * 10) / 10,
  };
}

async function mapWithConcurrency(values, concurrency, task) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await task(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

async function loadTrustedRecommendationSources(db, days) {
  const recommendationIds = Array.from(new Set(days.flatMap((day) => day.stops
    .map((stop) => stop.source?.recommendationId)
    .filter(Boolean))));
  if (!recommendationIds.length) return new Map();
  const snapshots = await Promise.all(recommendationIds.map((id) => db.doc(`recommendations/${id}`).get()));
  return new Map(snapshots.map((snapshot, index) => {
    assert(snapshot.exists, 'failed-precondition', 'A PlanLi recommendation used by this route is no longer available.');
    const recommendation = snapshot.data() || {};
    assert(recommendation.status === 'active', 'failed-precondition',
      'A PlanLi recommendation used by this route is no longer active.');
    const catalogCategoryId = normalizeRecommendationCategory(recommendation.categoryId);
    const catalogSubcategoryIds = normalizeRecommendationSubcategories(
      recommendation.subcategoryIds,
      catalogCategoryId
    );
    const legacyCategoryId = normalizeCategoryIds([
      recommendation.categoryId || recommendation.category,
    ])[0] || '';
    const legacySubcategoryIds = normalizeRecommendationTags(recommendation.tags || []);
    return [recommendationIds[index], {
      categoryId: catalogCategoryId || legacyCategoryId,
      subcategoryIds: catalogSubcategoryIds.length ? catalogSubcategoryIds : legacySubcategoryIds,
    }];
  }));
}

async function resolveRoutePlaces({
  admin,
  auth,
  days,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
  trustedPlaces = new Map(),
  trustedRecommendations = new Map(),
  resolveExisting = resolveExistingDestination,
  resolveSubmitted = resolveSubmittedPlaceDestination,
  consumeBudget = consumeProviderBudget,
}) {
  const placeEntries = new Map();
  const destinationEntries = new Map();
  days.forEach((day) => day.stops.forEach((stop) => {
    const placeId = stop.place?.placeId;
    if (placeId) {
      const current = placeEntries.get(placeId);
      if (!current || (!current.resolvedPlaceToken && stop.place.resolvedPlaceToken)) {
        placeEntries.set(placeId, {
          placeId,
          resolvedPlaceToken: stop.place.resolvedPlaceToken || null,
          trusted: trustedPlaces.get(placeId) || null,
        });
      }
      return;
    }
    if (stop.destination?.countryId && stop.destination?.cityId) {
      const key = `${stop.destination.countryId}/${stop.destination.cityId}`;
      destinationEntries.set(key, stop.destination);
    }
  }));
  const entries = Array.from(placeEntries.values());
  assert(entries.length <= MAX_ROUTE_PLACES,
    'invalid-argument', 'Route contains too many distinct places.');
  assert(entries.length + destinationEntries.size >= 1,
    'invalid-argument', 'Route requires at least one destination.');
  const rawEntries = entries.filter((entry) => !entry.resolvedPlaceToken && !entry.trusted);
  const rawDestinationEntries = Array.from(destinationEntries.values()).filter(
    (entry) => entry.providerPlaceId && !entry.resolvedPlaceToken
  );
  const rawProviderResolutionCount = rawEntries.length + rawDestinationEntries.length;
  if (rawProviderResolutionCount > MAX_PROVIDER_RESOLUTIONS_PER_SAVE) {
    throw new HttpsError(
      'resource-exhausted',
      'This route contains too many new places to verify at once. Save a section with at most five places.',
      { reason: 'ROUTE_NEW_PLACE_LIMIT', retryable: false, providerCalls: 0 }
    );
  }
  if (rawProviderResolutionCount) {
    await consumeBudget({
      admin,
      auth,
      action: 'fullResolution',
      units: rawProviderResolutionCount,
      key: providerRateLimitKey,
    });
  }
  const resolved = await mapWithConcurrency(entries, 5, async (entry) => {
    if (entry.trusted && !entry.resolvedPlaceToken) {
      const destination = await resolveExisting(
        admin.firestore(),
        entry.trusted.destination
      );
      destination.place = entry.trusted.place;
      return destination;
    }
    const destination = await resolveSubmitted({
      admin,
      auth,
      placeId: entry.placeId,
      resolvedPlaceToken: entry.resolvedPlaceToken,
      mapsKey,
      newPlacesKey,
      placesProvider,
      restCountriesKey,
      providerRateLimitKey,
      providerBudgetConsumed: !entry.resolvedPlaceToken,
    });
    assert(destination.place?.placeId === entry.placeId, 'failed-precondition', 'A route place token does not match its stop. Search again.');
    return destination;
  });
  const resolvedGeneral = await mapWithConcurrency(
    Array.from(destinationEntries.entries()),
    5,
    async ([key, destinationRef]) => {
      if (!destinationRef.providerPlaceId) {
        return { key, destination: await resolveExisting(admin.firestore(), destinationRef) };
      }
      const destination = await resolveSubmitted({
        admin,
        auth,
        placeId: destinationRef.providerPlaceId,
        resolvedPlaceToken: destinationRef.resolvedPlaceToken || null,
        mapsKey,
        newPlacesKey,
        placesProvider,
        restCountriesKey,
        providerRateLimitKey,
        providerBudgetConsumed: !destinationRef.resolvedPlaceToken,
      });
      assert(
        destination.countryId === destinationRef.countryId && destination.cityId === destinationRef.cityId,
        'failed-precondition',
        'A route destination token does not match its stop. Search again.'
      );
      return { key, destination };
    }
  );
  const byPlaceId = new Map(entries.map((entry, index) => [entry.placeId, resolved[index]]));
  const byDestination = new Map(resolvedGeneral.map((entry) => [entry.key, entry.destination]));
  const resolvedDays = days.map((day) => ({
    ...day,
    stops: day.stops.map((stop) => {
      const trustedRecommendation = stop.source?.recommendationId
        ? trustedRecommendations.get(stop.source.recommendationId)
        : null;
      assert(!stop.source?.recommendationId || trustedRecommendation,
        'failed-precondition', 'A PlanLi recommendation used by this route is no longer available.');
      const destination = stop.place?.placeId
        ? byPlaceId.get(stop.place.placeId)
        : byDestination.get(`${stop.destination?.countryId}/${stop.destination?.cityId}`);
      assert(destination, 'failed-precondition', 'A route place could not be verified.');
      const precisePlace = stop.place?.placeId
        ? destination.place
        : stop.locationPrecision === 'pin'
          ? {
              placeId: '',
              name: stop.place?.name || stop.title,
              address: stop.place?.address || '',
              coordinates: stop.coordinates || stop.place?.coordinates,
            }
          : null;
      return {
        ...stop,
        location: precisePlace?.name || stop.location ||
          destinationHebrewName(destination.cityData) || destination.cityId,
        country: destination.countryData.name || destination.countryId,
        ...(precisePlace ? { place: precisePlace } : {}),
        destination: {
          countryId: destination.countryId,
          cityId: destination.cityId,
          countryName: destination.countryData.name || destination.countryId,
          cityName: destinationHebrewName(destination.cityData) || destination.cityId,
        },
        ...(trustedRecommendation?.categoryId ? { categoryId: trustedRecommendation.categoryId } : {}),
        subcategoryIds: trustedRecommendation?.subcategoryIds || [],
      };
    }),
  }));
  const uniqueDestinations = new Map();
  [...resolved, ...resolvedGeneral.map((entry) => entry.destination)].forEach((destination) => {
    uniqueDestinations.set(destination.cityRef.path, destination);
  });
  assert(uniqueDestinations.size <= MAX_ROUTE_DESTINATIONS, 'invalid-argument', 'Route contains too many destinations.');
  return {
    days: resolvedDays,
    providerCalls: rawProviderResolutionCount,
    catalogDestinations: Array.from(uniqueDestinations.values()),
    destinations: Array.from(uniqueDestinations.values()).map((destination) => ({
      countryId: destination.countryId,
      cityId: destination.cityId,
      countryName: destination.countryData.name || destination.countryId,
      cityName: destinationHebrewName(destination.cityData) || destination.cityId,
    })),
  };
}

async function loadTrustedRoutePlaces({ db, routeRef, existingRoute, days }) {
  const trustedStops = days.flatMap((day) => day.stops
    .filter((stop) => stop.id && stop.locationPrecision === 'exact' &&
      stop.place?.placeId && !stop.place?.resolvedPlaceToken)
    .map((stop) => ({ dayId: day.id, stop }))
  );
  if (!trustedStops.length) return new Map();
  assert(existingRoute?.activeRevisionId, 'failed-precondition',
    'The active route revision is unavailable. Reload the route and try again.');
  const snapshots = await Promise.all(trustedStops.map(({ dayId, stop }) =>
    db.doc(
      `routes/${routeRef.id}/revisions/${existingRoute.activeRevisionId}/days/${dayId}/stops/${stop.id}`
    ).get()
  ));
  const trustedPlaces = new Map();
  snapshots.forEach((snapshot, index) => {
    const submitted = trustedStops[index].stop;
    const saved = snapshot.exists ? snapshot.data() || {} : null;
    const unchanged = saved?.place?.placeId === submitted.place.placeId &&
      saved?.destination?.countryId && saved?.destination?.cityId;
    if (submitted.reuseSavedLocation) {
      assert(unchanged, 'failed-precondition',
        'A saved route stop changed. Search for its location again.');
    }
    if (!unchanged) return;
    trustedPlaces.set(saved.place.placeId, {
      destination: {
        countryId: saved.destination.countryId,
        cityId: saved.destination.cityId,
      },
      place: saved.place,
    });
  });
  return trustedPlaces;
}

function revisionVersion(routeData) {
  const version = Number(routeData?.revisionVersion || 0);
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

function routeRevisionId(routeRef) {
  return routeRef.collection('revisions').doc().id;
}

function assertEditableRoute(snapshot, uid, isAdmin) {
  assert(snapshot.exists, 'not-found', 'Route does not exist.');
  const route = snapshot.data();
  assert(route?.ownerId === uid || isAdmin, 'permission-denied', 'You do not own this route.');
  assert(route?.status !== 'deleting', 'failed-precondition', 'Route deletion is already in progress.');
  return route;
}

function assertRouteRevisionVersion(routeData, expectedVersion) {
  assert(
    revisionVersion(routeData) === expectedVersion,
    'aborted',
    'This route changed while it was being saved. Reload it and try again.'
  );
}

function preservedRouteStatus(routeData) {
  return routeData?.status || 'active';
}

async function saveRoute({
  admin,
  auth,
  data,
  mediaBucket,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
}) {
  const saveStartedAt = Date.now();
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'Email verification is required.');
  assert(placesProvider === 'new' ? newPlacesKey : mapsKey, 'failed-precondition',
    placesProvider === 'new' ? 'GOOGLE_PLACES_NEW_KEY is not configured.' : 'GOOGLE_MAPS_KEY is not configured.');
  const db = admin.firestore();
  const uid = auth.uid;
  const routeId = typeof data?.routeId === 'string' && data.routeId.trim()
    ? cleanDocumentId(data.routeId, 'routeId', '')
    : null;
  const publishRequestId = normalizePublishRequestId(data?.publishRequestId);
  const draftPublicationId = normalizePublishRequestId(data?.draftPublicationId);
  assert(!(routeId && publishRequestId), 'invalid-argument',
    'publishRequestId is only supported when creating a route.');
  assert(!draftPublicationId || routeId, 'invalid-argument',
    'draftPublicationId is only supported when updating a route.');
  const routeRef = routeId
    ? db.doc(`routes/${routeId}`)
    : publishRequestId
      ? db.doc(`routes/${stableDocumentId('route', `${uid}:${publishRequestId}`)}`)
      : db.collection('routes').doc();
  const existingSnapshot = await routeRef.get();
  const isAdmin = routeId ? await hasActiveAdminAccess({ admin, auth }) : false;
  const existingRoute = routeId
    ? assertEditableRoute(existingSnapshot, uid, isAdmin)
    : null;
  if (routeId) {
    assert(existingRoute, 'not-found', 'Route does not exist.');
    if (draftPublicationId && existingRoute.lastDraftPublicationId === draftPublicationId) {
      return {
        routeId: routeRef.id,
        revisionId: existingRoute.activeRevisionId,
        revisionVersion: revisionVersion(existingRoute),
        idempotentReplay: true,
      };
    }
  } else {
    if (existingSnapshot.exists && publishRequestId) {
      const replay = existingSnapshot.data() || {};
      assert(replay.ownerId === uid, 'already-exists',
        'This publication request conflicts with an existing route.');
      assert((replay.status || 'active') === 'active' && replay.activeRevisionId,
        'failed-precondition', 'The existing route publication is not active.');
      console.info('route_save_timing', {
        durationMs: Date.now() - saveStartedAt,
        idempotentReplay: true,
      });
      return {
        routeId: routeRef.id,
        revisionId: replay.activeRevisionId,
        revisionVersion: revisionVersion(replay),
        idempotentReplay: true,
      };
    }
    assert(!existingSnapshot.exists, 'already-exists', 'Route already exists.');
  }
  assert(Number(data?.route?.taxonomyVersion || 0) >= taxonomy.version,
    'failed-precondition', 'Update PlanLi to choose Free or Cheap as separate budget options.');
  const baseVersion = revisionVersion(existingRoute);
  const route = sanitizeRouteInput(data?.route);
  const textSafety = evaluateTextSafety([
    route.title,
    route.description,
    ...route.days.flatMap((day) => [day.description, ...day.stops.flatMap((stop) => [stop.title, stop.description])]),
  ]);
  const requestedMedia = collectMedia(route.days);
  assert(requestedMedia.length <= MAX_ROUTE_MEDIA, 'invalid-argument', 'Route contains too many images.');
  if (requestedMedia.length) assert(mediaBucket, 'failed-precondition', 'MEDIA_STORAGE_BUCKET is not configured.');
  const validatedMedia = await validateMediaAssets({
    admin,
    uid,
    media: requestedMedia,
    mediaBucket,
    maxAssets: MAX_ROUTE_MEDIA,
    existingMedia: existingRoute?.media,
  });
  const mediaDays = replaceValidatedMedia(route.days, validatedMedia);
  const trustedPlaces = routeId
    ? await loadTrustedRoutePlaces({
        db,
        routeRef,
        existingRoute,
        days: mediaDays,
      })
    : new Map();
  const trustedRecommendations = await loadTrustedRecommendationSources(db, mediaDays);
  const locationStartedAt = Date.now();
  const resolved = await resolveRoutePlaces({
    admin,
    auth,
    days: mediaDays,
    mapsKey,
    newPlacesKey,
    placesProvider,
    restCountriesKey,
    providerRateLimitKey,
    trustedPlaces,
    trustedRecommendations,
  });
  const routeLegs = route.routeSchemaVersion >= 2
    ? attachRouteLegEstimates(resolved.days, route.transportModes)
    : { days: resolved.days, distanceKm: route.distanceKm };
  const days = routeLegs.days;

  const writeCount = days.length + days.reduce((sum, day) => sum + day.stops.length, 0) +
    resolved.catalogDestinations.length * 3 + 1;
  assert(writeCount <= 500, 'failed-precondition', 'Route is too large to save atomically.');

  const summaryPlaces = Array.from(new Set(days.flatMap((day) =>
    day.stops.map((stop) => stop.location || stop.place?.name || stop.destination?.cityName).filter(Boolean)
  ))).slice(0, 30);
  const destinationKeys = Array.from(new Set(resolved.destinations.flatMap((destination) => [
    destinationKey(destination.countryId),
    destinationKey(destination.countryId, destination.cityId),
  ])));
  const now = admin.firestore.FieldValue.serverTimestamp();
  const revisionId = routeRevisionId(routeRef);
  const revisionRef = routeRef.collection('revisions').doc(revisionId);
  const destinationDocuments = new Map();
  const destinationClaims = new Map();
  for (const destination of resolved.catalogDestinations) {
    destinationDocuments.set(destination.countryRef.path, {
      ref: destination.countryRef,
      data: destination.countryData,
      create: destination.createCountry,
      kind: 'country',
    });
    destinationDocuments.set(destination.cityRef.path, {
      ref: destination.cityRef,
      data: {
        ...destination.cityData,
        stats: { ...(destination.cityData.stats || {}), recommendationCount: 0 },
      },
      create: destination.createCity,
      kind: 'destination',
    });
    if (destination.claimRef && destination.claimData) {
      const previousClaim = destinationClaims.get(destination.claimRef.path);
      destinationClaims.set(destination.claimRef.path, {
        ref: destination.claimRef,
        data: {
          ...destination.claimData,
          entries: {
            ...(previousClaim?.data?.entries || {}),
            ...(destination.claimData.entries || {}),
          },
        },
      });
    }
  }
  const batch = db.batch();
  batch.create(revisionRef, {
    state: 'prepared',
    ownerId: existingRoute?.ownerId || uid,
    baseVersion,
    dayCount: route.dayCount,
    stopCount: days.reduce((sum, day) => sum + day.stops.length, 0),
    createdAt: now,
    expireAt: new Date(Date.now() + PREPARED_REVISION_TTL_MS),
  });
  days.forEach((day) => {
    const dayRef = revisionRef.collection('days').doc(day.id);
    batch.set(dayRef, { position: day.position, description: day.description, media: day.media, stopCount: day.stops.length });
    day.stops.forEach((stop) => {
      batch.set(dayRef.collection('stops').doc(stop.id), {
        position: stop.position,
        title: stop.title,
        description: stop.description,
        location: stop.location,
        country: stop.country,
        place: stop.place || null,
        destination: stop.destination,
        locationPrecision: stop.locationPrecision || (stop.place?.placeId ? 'exact' : 'general'),
        coordinates: stop.coordinates || null,
        source: stop.source || null,
        categoryId: stop.categoryId || '',
        startTime: stop.startTime || '',
        durationMinutes: stop.durationMinutes || null,
        subcategoryIds: stop.subcategoryIds || [],
        travelFromPrevious: stop.travelFromPrevious || null,
        media: stop.media,
        additionalMedia: stop.additionalMedia || [],
      });
    });
  });
  await batch.commit();

  const transactionOutcome = await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(routeRef);
    const currentRoute = routeId
      ? assertEditableRoute(currentSnapshot, uid, isAdmin)
      : null;
    if (!routeId) {
      if (currentSnapshot.exists && publishRequestId) {
        const replay = currentSnapshot.data() || {};
        assert(replay.ownerId === uid, 'already-exists',
          'This publication request conflicts with an existing route.');
        assert((replay.status || 'active') === 'active' && replay.activeRevisionId,
          'failed-precondition', 'The existing route publication is not active.');
        transaction.update(revisionRef, {
          state: 'superseded',
          supersededAt: now,
          expireAt: new Date(Date.now() + PREPARED_REVISION_TTL_MS),
        });
        return { replay: true, data: replay };
      }
      assert(!currentSnapshot.exists, 'already-exists', 'Route already exists.');
    }
    assertRouteRevisionVersion(currentRoute, baseVersion);
    const previousRevisionRef = currentRoute?.activeRevisionId
      ? routeRef.collection('revisions').doc(currentRoute.activeRevisionId)
      : null;
    const previousRevisionSnapshot = previousRevisionRef
      ? await transaction.get(previousRevisionRef)
      : null;
    const destinationEntries = Array.from(destinationDocuments.values());
    const claimEntries = Array.from(destinationClaims.values());
    const [destinationSnapshots, claimSnapshots] = await Promise.all([
      Promise.all(destinationEntries.map((entry) => transaction.get(entry.ref))),
      Promise.all(claimEntries.map((entry) => transaction.get(entry.ref))),
    ]);
    const canonicalDestinationNames = new Map();

    destinationEntries.forEach((entry, index) => {
      const snapshot = destinationSnapshots[index];
      if (!snapshot.exists) {
        assert(
          entry.create,
          'not-found',
          `The selected ${entry.kind} no longer exists.`
        );
        transaction.create(entry.ref, {
          ...entry.data,
          createdAt: now,
          updatedAt: now,
        });
        if (entry.kind === 'destination') {
          canonicalDestinationNames.set(entry.ref.path, destinationHebrewName(entry.data));
        }
        return;
      }
      assert(
        snapshot.data()?.status === 'active',
        'failed-precondition',
        `The selected ${entry.kind} is no longer active.`
      );
      if (entry.kind === 'destination') {
        const countryId = entry.ref.path.split('/')[1];
        const canonical = normalizeDestinationHebrewData(snapshot.data(), { countryCode: countryId });
        assert(hasHebrewName(canonical.name), 'failed-precondition',
          'The destination has no trustworthy Hebrew name.');
        canonicalDestinationNames.set(entry.ref.path, canonical.name);
        if (canonical.changed) {
          transaction.update(entry.ref, {
            ...destinationHebrewWritePatch(canonical.destination),
            updatedAt: now,
          });
        }
      }
    });

    claimEntries.forEach((entry, index) => {
      const snapshot = claimSnapshots[index];
      const existing = snapshot.exists ? snapshot.data() || {} : {};
      if (snapshot.exists) {
        assert(
          existing.countryId === entry.data.countryId &&
            existing.destinationType === entry.data.destinationType,
          'failed-precondition',
          'A destination identity claim changed while saving. Search again.'
        );
        for (const [destinationId, value] of Object.entries(entry.data.entries || {})) {
          const conflictingDestination = Object.entries(existing.entries || {})
            .find(([existingId, existingValue]) =>
              existingId !== destinationId &&
              existingValue?.providerPlaceId === value?.providerPlaceId
            );
          assert(
            !conflictingDestination,
            'failed-precondition',
            'A destination identity changed while saving. Search again.'
          );
        }
      }
      transaction.set(entry.ref, {
        ...entry.data,
        entries: {
          ...(existing.entries || {}),
          ...(entry.data.entries || {}),
        },
        ...(snapshot.exists ? {} : { createdAt: now }),
        updatedAt: now,
      }, { merge: true });
    });

    const canonicalDestinations = resolved.destinations.map((destination) => ({
      ...destination,
      cityName: canonicalDestinationNames.get(
        `countries/${destination.countryId}/destinations/${destination.cityId}`
      ) || destination.cityName,
    }));
    const canonicalSearch = buildSearchIndex({
      title: route.title,
      description: `${route.description} ${summaryPlaces.join(' ')}`,
      destinations: canonicalDestinations,
      categoryIds: route.categoryIds,
      subcategoryIds: route.subcategoryIds,
      interestIds: route.facets.interests,
    });
    days.forEach((day) => day.stops.forEach((stop) => {
      const canonicalName = canonicalDestinationNames.get(
        `countries/${stop.destination.countryId}/destinations/${stop.destination.cityId}`
      );
      if (canonicalName && canonicalName !== stop.destination.cityName) {
        transaction.update(revisionRef.collection('days').doc(day.id).collection('stops').doc(stop.id), {
          destination: { ...stop.destination, cityName: canonicalName },
        });
      }
    }));
    const routeDocument = {
      taxonomyVersion: taxonomy.version,
      ownerId: currentRoute?.ownerId || uid,
      title: route.title,
      description: route.description,
      routeSchemaVersion: route.routeSchemaVersion,
      status: preservedRouteStatus(currentRoute) === 'active' && !textSafety.safe
        ? 'moderation_hold'
        : preservedRouteStatus(currentRoute),
      ...(!textSafety.safe ? { moderation: { holdReason: textSafety.reason } } : {}),
      dayCount: route.dayCount,
      distanceKm: routeLegs.distanceKm,
      priceBasis: route.priceBasis || 'whole_route',
      priceNote: route.priceNote || '',
      categoryIds: route.categoryIds,
      subcategoryIds: route.subcategoryIds,
      facets: route.facets,
      difficulty: route.difficulty,
      experienceLevel: route.experienceLevel,
      transportModes: route.transportModes,
      pace: route.pace,
      destinations: canonicalDestinations,
      destinationKeys,
      summaryPlaces,
      search: canonicalSearch,
      media: validatedMedia,
      stats: currentRoute?.stats || { likeCount: 0, commentCount: 0 },
      activeRevisionId: revisionId,
      revisionVersion: baseVersion + 1,
      createdAt: currentRoute?.createdAt || now,
      updatedAt: now,
      ...(draftPublicationId ? { lastDraftPublicationId: draftPublicationId } : {}),
    };
    if (currentSnapshot.exists) transaction.set(routeRef, routeDocument);
    else transaction.create(routeRef, routeDocument);
    transaction.update(revisionRef, {
      state: 'active',
      activatedAt: now,
      expireAt: null,
    });
    if (previousRevisionSnapshot?.exists) {
      transaction.update(previousRevisionRef, {
        state: 'superseded',
        supersededAt: now,
        expireAt: new Date(Date.now() + SUPERSEDED_REVISION_TTL_MS),
      });
    }
    return { replay: false };
  });
  console.info('route_place_resolution_timing', {
    durationMs: Date.now() - locationStartedAt,
    stopCount: mediaDays.reduce((sum, day) => sum + day.stops.length, 0),
    providerCalls: resolved.providerCalls,
  });
  if (transactionOutcome?.replay) {
    if (typeof db.recursiveDelete === 'function') {
      await db.recursiveDelete(revisionRef).catch((error) => {
        console.warn('route_replay_revision_cleanup_failed', {
          code: String(error?.code || 'unknown'),
        });
      });
    }
    console.info('route_save_timing', {
      durationMs: Date.now() - saveStartedAt,
      idempotentReplay: true,
    });
    return {
      routeId: routeRef.id,
      revisionId: transactionOutcome.data?.activeRevisionId,
      revisionVersion: revisionVersion(transactionOutcome.data),
      idempotentReplay: true,
    };
  }
  console.info('route_save_timing', {
    durationMs: Date.now() - saveStartedAt,
    idempotentReplay: false,
  });
  return { routeId: routeRef.id, revisionId, revisionVersion: baseVersion + 1 };
}

async function loadRouteDetails({ admin, data }) {
  const routeId = cleanDocumentId(data?.routeId, 'routeId', '');
  const routeRef = admin.firestore().doc(`routes/${routeId}`);
  const routeSnapshot = await routeRef.get();
  assert(routeSnapshot.exists && routeSnapshot.data()?.status === 'active', 'not-found', 'Route does not exist.');
  const routeData = routeSnapshot.data();
  const revisionId = routeData.activeRevisionId;
  assert(revisionId, 'failed-precondition', 'Route has no active revision.');
  const revisionRef = routeRef.collection('revisions').doc(revisionId);
  const revisionSnapshot = await revisionRef.get();
  assert(revisionSnapshot.exists && revisionSnapshot.data()?.state === 'active', 'not-found', 'Route revision does not exist.');
  const daysCollection = revisionRef.collection('days');
  const daySnapshots = await daysCollection.orderBy('position').limit(MAX_ROUTE_DAYS + 1).get();
  assert(daySnapshots.size <= MAX_ROUTE_DAYS, 'failed-precondition', 'Route contains too many days.');
  const days = [];
  let totalStops = 0;
  for (const dayDocument of daySnapshots.docs) {
    const remainingStops = MAX_ROUTE_STOPS - totalStops;
    const stopsSnapshot = await dayDocument.ref.collection('stops')
      .orderBy('position')
      .limit(remainingStops + 1)
      .get();
    assert(stopsSnapshot.size <= remainingStops, 'failed-precondition', 'Route contains too many stops.');
    totalStops += stopsSnapshot.size;
    days.push({
      id: dayDocument.id,
      ...dayDocument.data(),
      stops: stopsSnapshot.docs.map((stop) => {
        const data = stop.data();
        return {
          id: stop.id,
          ...data,
          locationPrecision: data.locationPrecision || (data.place?.placeId ? 'exact' : 'general'),
        };
      }),
    });
  }
  const [route] = await attachRouteDestinationPreviews(admin.firestore(), [{
    id: routeSnapshot.id,
    ...routeSnapshot.data(),
    priceBasis: routeSnapshot.data()?.priceBasis || 'whole_route',
    days,
  }]);
  return { route };
}

async function cleanupRouteRevisions({ admin, limit = 100, now = new Date() }) {
  const snapshot = await admin.firestore()
    .collectionGroup('revisions')
    .where('expireAt', '<=', now)
    .limit(limit)
    .get();
  let deleted = 0;
  for (const revision of snapshot.docs) {
    const segments = revision.ref.path.split('/');
    if (
      segments.length !== 4 ||
      segments[0] !== 'routes' ||
      segments[2] !== 'revisions' ||
      revision.data()?.state === 'active'
    ) {
      continue;
    }
    await admin.firestore().recursiveDelete(revision.ref);
    deleted += 1;
  }
  return { scanned: snapshot.size, deleted };
}

module.exports = {
  MAX_ROUTE_DAYS,
  MAX_ROUTE_MEDIA,
  MAX_ROUTE_PLACES,
  MAX_ROUTE_STOPS,
  MAX_PROVIDER_RESOLUTIONS_PER_SAVE,
  assertEditableRoute,
  assertRouteRevisionVersion,
  attachRouteLegEstimates,
  cleanupRouteRevisions,
  collectMedia,
  loadRouteDetails,
  loadTrustedRecommendationSources,
  loadTrustedRoutePlaces,
  mapWithConcurrency,
  resolveRoutePlaces,
  revisionVersion,
  preservedRouteStatus,
  sanitizeRouteInput,
  sanitizeRouteMetadata,
  saveRoute,
};
