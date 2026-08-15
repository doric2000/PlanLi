const { HttpsError } = require('firebase-functions/v2/https');
const { evaluateTextSafety } = require('./moderationService');
const {
  isVerifiedCaller,
  normalizePublishRequestId,
  resolveSubmittedPlaceDestination,
  stableDocumentId,
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

function sanitizePlace(value, fallbackCoordinates, { requirePlaceId = false } = {}) {
  const place = value && typeof value === 'object' ? value : {};
  const placeId = cleanOptionalString(place.placeId, 'place.placeId', 300);
  const resolvedPlaceToken = cleanOptionalString(place.resolvedPlaceToken, 'place.resolvedPlaceToken', 300);
  assert(!requirePlaceId || placeId, 'invalid-argument', 'Every route stop requires a verified Place ID.');
  return {
    placeId,
    ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
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

async function resolveRoutePlaces({
  admin,
  auth,
  days,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  restCountriesKey,
  providerRateLimitKey,
}) {
  const placeEntries = new Map();
  days.forEach((day) => day.stops.forEach((stop) => {
    const placeId = stop.place.placeId;
    if (!placeId) return;
    const current = placeEntries.get(placeId);
    if (!current || (!current.resolvedPlaceToken && stop.place.resolvedPlaceToken)) {
      placeEntries.set(placeId, { placeId, resolvedPlaceToken: stop.place.resolvedPlaceToken || null });
    }
  }));
  const entries = Array.from(placeEntries.values());
  assert(entries.length >= 1 && entries.length <= MAX_ROUTE_PLACES,
    'invalid-argument', 'Route contains too many distinct places.');
  const rawEntries = entries.filter((entry) => !entry.resolvedPlaceToken);
  assert(
    rawEntries.length <= MAX_PROVIDER_RESOLUTIONS_PER_SAVE,
    'resource-exhausted',
    'This route contains too many new places to verify at once. Save a section with at most five places.'
  );
  if (rawEntries.length) {
    await consumeProviderBudget({
      admin,
      auth,
      action: 'bilingualResolution',
      units: rawEntries.length,
      key: providerRateLimitKey,
    });
  }
  const resolved = await mapWithConcurrency(entries, 5, async (entry) => {
    const destination = await resolveSubmittedPlaceDestination({
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
  const byPlaceId = new Map(entries.map((entry, index) => [entry.placeId, resolved[index]]));
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
          cityName: destination.cityData.googleCache?.names?.he || destination.cityData.name || destination.cityId,
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
      cityName: destination.cityData.googleCache?.names?.he || destination.cityData.name || destination.cityId,
    })),
  };
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
  assert(!(routeId && publishRequestId), 'invalid-argument',
    'publishRequestId is only supported when creating a route.');
  const routeRef = routeId
    ? db.doc(`routes/${routeId}`)
    : publishRequestId
      ? db.doc(`routes/${stableDocumentId('route', `${uid}:${publishRequestId}`)}`)
      : db.collection('routes').doc();
  const existingSnapshot = await routeRef.get();
  const isAdmin = auth.token?.admin === true;
  const existingRoute = routeId
    ? assertEditableRoute(existingSnapshot, uid, isAdmin)
    : null;
  if (routeId) {
    assert(existingRoute, 'not-found', 'Route does not exist.');
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
  });
  const days = resolved.days;

  const writeCount = days.length + days.reduce((sum, day) => sum + day.stops.length, 0) +
    resolved.catalogDestinations.length * 3 + 1;
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
        place: stop.place,
        destination: stop.destination,
        media: stop.media,
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
        return;
      }
      assert(
        snapshot.data()?.status === 'active',
        'failed-precondition',
        `The selected ${entry.kind} is no longer active.`
      );
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

    const routeDocument = {
      taxonomyVersion: taxonomy.version,
      ownerId: currentRoute?.ownerId || uid,
      title: route.title,
      description: route.description,
      status: preservedRouteStatus(currentRoute) === 'active' && !textSafety.safe
        ? 'moderation_hold'
        : preservedRouteStatus(currentRoute),
      ...(!textSafety.safe ? { moderation: { holdReason: textSafety.reason } } : {}),
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
      stats: currentRoute?.stats || { likeCount: 0, commentCount: 0 },
      activeRevisionId: revisionId,
      revisionVersion: baseVersion + 1,
      createdAt: currentRoute?.createdAt || now,
      updatedAt: now,
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
      stops: stopsSnapshot.docs.map((stop) => ({ id: stop.id, ...stop.data() })),
    });
  }
  const [route] = await attachRouteDestinationPreviews(admin.firestore(), [{
    id: routeSnapshot.id,
    ...routeSnapshot.data(),
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
  cleanupRouteRevisions,
  collectMedia,
  loadRouteDetails,
  mapWithConcurrency,
  resolveRoutePlaces,
  revisionVersion,
  preservedRouteStatus,
  sanitizeRouteInput,
  sanitizeRouteMetadata,
  saveRoute,
};
