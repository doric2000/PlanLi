const { HttpsError } = require('firebase-functions/v2/https');
const {
  isVerifiedCaller,
  resolveGoogleDestination,
  validateMediaAssets,
} = require('./recommendationService');
const {
  buildTravelContentFacets,
  CATEGORY_IDS,
  ENVIRONMENT_IDS,
  INTEREST_IDS,
  NEED_IDS,
  normalizeAliasedId,
  normalizeBudget,
  normalizeCategoryIds,
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

const MAX_ROUTE_DAYS = 60;
const MAX_ROUTE_STOPS = 150;
const MAX_ROUTE_MEDIA = 40;
const MAX_ROUTE_PLACES = 50;
const MAX_ROUTE_DESTINATIONS = 20;

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

function sanitizePlace(value, fallbackCoordinates, { requirePlaceId = false } = {}) {
  const place = value && typeof value === 'object' ? value : {};
  const placeId = cleanOptionalString(place.placeId, 'place.placeId', 300);
  assert(!requirePlaceId || placeId, 'invalid-argument', 'Every route stop requires a verified Place ID.');
  return {
    placeId,
    name: cleanOptionalString(place.name, 'place.name', 200),
    address: cleanOptionalString(place.address, 'place.address', 500),
    url: cleanOptionalString(place.url, 'place.url', 2000),
    coordinates: cleanCoordinates(place.coordinates || fallbackCoordinates),
  };
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

function sanitizeRouteMetadata(input) {
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
  const strict = Number(input.taxonomyVersion || 0) >= 3;
  const days = Array.isArray(input.days) ? input.days : [];
  assert(days.length >= 1 && days.length <= MAX_ROUTE_DAYS, 'invalid-argument', 'Route days are invalid.');
  let totalStops = 0;
  const sanitizedDays = days.map((day, dayIndex) => {
    const stops = Array.isArray(day?.stops) ? day.stops : [];
    totalStops += stops.length;
    const sanitizedStops = stops.map((stop, stopIndex) => ({
      id: cleanDocumentId(stop?.id, `days[${dayIndex}].stops[${stopIndex}].id`, `stop_${String(stopIndex + 1).padStart(3, '0')}`),
      position: stopIndex,
      title: cleanString(stop?.title, `days[${dayIndex}].stops[${stopIndex}].title`, { min: 1, max: 160 }),
      description: cleanOptionalString(stop?.description, `days[${dayIndex}].stops[${stopIndex}].description`, 3000),
      location: cleanOptionalString(stop?.location, `days[${dayIndex}].stops[${stopIndex}].location`, 200),
      country: cleanOptionalString(stop?.country, `days[${dayIndex}].stops[${stopIndex}].country`, 200),
      place: sanitizePlace(stop?.place, stop?.coordinates, { requirePlaceId: strict }),
      media: stop?.media || null,
    }));
    return {
      id: `day_${String(dayIndex + 1).padStart(3, '0')}`,
      position: dayIndex,
      description: cleanOptionalString(day?.description, `days[${dayIndex}].description`, 5000),
      media: day?.media || null,
      stops: sanitizedStops,
    };
  });
  assert(totalStops >= 1 && totalStops <= MAX_ROUTE_STOPS, 'invalid-argument', 'Route stops are invalid.');
  const distanceKm = Number(input.distanceKm);
  assert(Number.isFinite(distanceKm) && distanceKm >= 0, 'invalid-argument', 'distanceKm is invalid.');
  return {
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
    })),
  }));
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

async function resolveRoutePlaces({ admin, days, mapsKey, restCountriesKey }) {
  const placeIds = Array.from(new Set(days.flatMap((day) => day.stops.map((stop) => stop.place.placeId).filter(Boolean))));
  assert(placeIds.length >= 1 && placeIds.length <= MAX_ROUTE_PLACES,
    'invalid-argument', 'Route contains too many distinct places.');
  const resolved = await mapWithConcurrency(placeIds, 5, (placeId) => resolveGoogleDestination({
    admin,
    placeId,
    mapsKey,
    restCountriesKey,
  }));
  const byPlaceId = new Map(placeIds.map((placeId, index) => [placeId, resolved[index]]));
  const resolvedDays = days.map((day) => ({
    ...day,
    stops: day.stops.map((stop) => {
      const destination = byPlaceId.get(stop.place.placeId);
      assert(destination, 'failed-precondition', 'A route place could not be verified.');
      return {
        ...stop,
        location: destination.place.name || stop.location,
        country: destination.countryData.name || destination.countryId,
        place: destination.place,
        destination: {
          countryId: destination.countryId,
          cityId: destination.cityId,
          countryName: destination.countryData.name || destination.countryId,
          cityName: destination.cityData.name || destination.cityId,
        },
      };
    }),
  }));
  const uniqueDestinations = new Map();
  resolved.forEach((destination) => {
    uniqueDestinations.set(destination.cityRef.path, destination);
  });
  assert(uniqueDestinations.size <= MAX_ROUTE_DESTINATIONS, 'invalid-argument', 'Route contains too many destinations.');
  return {
    days: resolvedDays,
    catalogDestinations: Array.from(uniqueDestinations.values()),
    destinations: Array.from(uniqueDestinations.values()).map((destination) => ({
      countryId: destination.countryId,
      cityId: destination.cityId,
      countryName: destination.countryData.name || destination.countryId,
      cityName: destination.cityData.name || destination.cityId,
    })),
  };
}

async function listExistingRouteChildren(routeRef) {
  const daysSnapshot = await routeRef.collection('days').get();
  const stopsSnapshots = await Promise.all(daysSnapshot.docs.map((day) => day.ref.collection('stops').get()));
  return { days: daysSnapshot.docs, stops: stopsSnapshots.flatMap((snapshot) => snapshot.docs) };
}

async function saveRoute({ admin, auth, data, mediaBucket, mapsKey, restCountriesKey }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'Email verification is required.');
  assert(mapsKey, 'failed-precondition', 'GOOGLE_MAPS_KEY is not configured.');
  const db = admin.firestore();
  const uid = auth.uid;
  const routeId = typeof data?.routeId === 'string' && data.routeId.trim()
    ? cleanDocumentId(data.routeId, 'routeId', '')
    : null;
  const routeRef = routeId ? db.doc(`routes/${routeId}`) : db.collection('routes').doc();
  const route = sanitizeRouteInput(data?.route);
  const requestedMedia = collectMedia(route.days);
  assert(requestedMedia.length <= MAX_ROUTE_MEDIA, 'invalid-argument', 'Route contains too many images.');
  if (requestedMedia.length) assert(mediaBucket, 'failed-precondition', 'MEDIA_STORAGE_BUCKET is not configured.');
  const validatedMedia = await validateMediaAssets({ admin, uid, media: requestedMedia, mediaBucket, maxAssets: MAX_ROUTE_MEDIA });
  const mediaDays = replaceValidatedMedia(route.days, validatedMedia);
  const resolved = await resolveRoutePlaces({ admin, days: mediaDays, mapsKey, restCountriesKey });
  const days = resolved.days;

  const existingSnapshot = await routeRef.get();
  if (routeId) {
    assert(existingSnapshot.exists, 'not-found', 'Route does not exist.');
    assert(existingSnapshot.data()?.ownerId === uid || auth.token?.admin === true,
      'permission-denied', 'You do not own this route.');
  }
  const existingChildren = existingSnapshot.exists ? await listExistingRouteChildren(routeRef) : { days: [], stops: [] };
  const writeCount = existingChildren.days.length + existingChildren.stops.length + days.length +
    days.reduce((sum, day) => sum + day.stops.length, 0) + resolved.catalogDestinations.length * 2 + 1;
  assert(writeCount <= 500, 'failed-precondition', 'Route is too large to save atomically.');

  const summaryPlaces = Array.from(new Set(days.flatMap((day) =>
    day.stops.map((stop) => stop.location || stop.place.name).filter(Boolean)
  ))).slice(0, 30);
  const destinationKeys = Array.from(new Set(resolved.destinations.flatMap((destination) => [
    destinationKey(destination.countryId),
    destinationKey(destination.countryId, destination.cityId),
  ])));
  const search = buildSearchIndex({
    title: route.title,
    description: `${route.description} ${summaryPlaces.join(' ')}`,
    destinations: resolved.destinations,
    categoryIds: route.categoryIds,
    subcategoryIds: route.subcategoryIds,
    interestIds: route.facets.interests,
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  existingChildren.stops.forEach((entry) => batch.delete(entry.ref));
  existingChildren.days.forEach((entry) => batch.delete(entry.ref));
  for (const destination of resolved.catalogDestinations) {
    if (destination.createCountry) batch.set(destination.countryRef, { ...destination.countryData, createdAt: now, updatedAt: now }, { merge: true });
    if (destination.createCity) batch.set(destination.cityRef, {
      ...destination.cityData,
      stats: { ...(destination.cityData.stats || {}), recommendationCount: 0 },
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }
  days.forEach((day) => {
    const dayRef = routeRef.collection('days').doc(day.id);
    batch.set(dayRef, { position: day.position, description: day.description, media: day.media, stopCount: day.stops.length });
    day.stops.forEach((stop) => {
      batch.set(dayRef.collection('stops').doc(stop.id), {
        position: stop.position,
        title: stop.title,
        description: stop.description,
        location: stop.location,
        country: stop.country,
        place: stop.place,
        destination: stop.destination,
        media: stop.media,
      });
    });
  });
  batch.set(routeRef, {
    taxonomyVersion: taxonomy.version,
    ownerId: existingSnapshot.exists ? existingSnapshot.data().ownerId : uid,
    title: route.title,
    description: route.description,
    status: 'active',
    dayCount: route.dayCount,
    distanceKm: route.distanceKm,
    categoryIds: route.categoryIds,
    subcategoryIds: route.subcategoryIds,
    facets: route.facets,
    difficulty: route.difficulty,
    experienceLevel: route.experienceLevel,
    transportModes: route.transportModes,
    pace: route.pace,
    destinations: resolved.destinations,
    destinationKeys,
    summaryPlaces,
    search,
    media: validatedMedia,
    stats: existingSnapshot.exists ? existingSnapshot.data().stats || { likeCount: 0, commentCount: 0 } : { likeCount: 0, commentCount: 0 },
    createdAt: existingSnapshot.exists ? existingSnapshot.data().createdAt : now,
    updatedAt: now,
  });
  await batch.commit();
  return { routeId: routeRef.id };
}

async function loadRouteDetails({ admin, data }) {
  const routeId = cleanDocumentId(data?.routeId, 'routeId', '');
  const routeRef = admin.firestore().doc(`routes/${routeId}`);
  const routeSnapshot = await routeRef.get();
  assert(routeSnapshot.exists && routeSnapshot.data()?.status === 'active', 'not-found', 'Route does not exist.');
  const daySnapshots = await routeRef.collection('days').orderBy('position').get();
  const days = await Promise.all(daySnapshots.docs.map(async (dayDocument) => {
    const stopsSnapshot = await dayDocument.ref.collection('stops').orderBy('position').get();
    return { id: dayDocument.id, ...dayDocument.data(), stops: stopsSnapshot.docs.map((stop) => ({ id: stop.id, ...stop.data() })) };
  }));
  return { route: { id: routeSnapshot.id, ...routeSnapshot.data(), days } };
}

module.exports = {
  MAX_ROUTE_DAYS,
  MAX_ROUTE_MEDIA,
  MAX_ROUTE_PLACES,
  MAX_ROUTE_STOPS,
  collectMedia,
  loadRouteDetails,
  mapWithConcurrency,
  resolveRoutePlaces,
  sanitizeRouteInput,
  sanitizeRouteMetadata,
  saveRoute,
};
