const { HttpsError } = require('firebase-functions/v2/https');
const { isVerifiedCaller, validateMediaAssets } = require('./recommendationService');

const MAX_ROUTE_DAYS = 60;
const MAX_ROUTE_STOPS = 150;
const MAX_ROUTE_MEDIA = 40;

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

function cleanStringArray(value, field, maxItems = 30) {
  assert(Array.isArray(value), 'invalid-argument', `${field} must be an array.`);
  assert(value.length <= maxItems, 'invalid-argument', `${field} contains too many entries.`);
  return Array.from(new Set(value.map((entry) => cleanString(entry, field, { min: 1, max: 80 }))));
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

function sanitizePlace(value, fallbackCoordinates) {
  const place = value && typeof value === 'object' ? value : {};
  const coordinates = cleanCoordinates(place.coordinates || fallbackCoordinates);
  return {
    placeId: cleanOptionalString(place.placeId, 'place.placeId', 300),
    name: cleanOptionalString(place.name, 'place.name', 200),
    address: cleanOptionalString(place.address, 'place.address', 500),
    url: cleanOptionalString(place.url, 'place.url', 2000),
    coordinates,
  };
}

function sanitizeRouteInput(input) {
  assert(input && typeof input === 'object', 'invalid-argument', 'Missing route data.');
  const days = Array.isArray(input.days) ? input.days : [];
  assert(days.length >= 1 && days.length <= MAX_ROUTE_DAYS, 'invalid-argument', 'Route days are invalid.');
  let totalStops = 0;
  const sanitizedDays = days.map((day, dayIndex) => {
    const stops = Array.isArray(day?.stops) ? day.stops : [];
    totalStops += stops.length;
    const sanitizedStops = stops.map((stop, stopIndex) => ({
      id: cleanDocumentId(
        stop?.id,
        `days[${dayIndex}].stops[${stopIndex}].id`,
        `stop_${String(stopIndex + 1).padStart(3, '0')}`
      ),
      position: stopIndex,
      title: cleanString(stop?.title, `days[${dayIndex}].stops[${stopIndex}].title`, { min: 1, max: 160 }),
      description: cleanOptionalString(stop?.description, `days[${dayIndex}].stops[${stopIndex}].description`, 3000),
      location: cleanOptionalString(stop?.location, `days[${dayIndex}].stops[${stopIndex}].location`, 200),
      country: cleanOptionalString(stop?.country, `days[${dayIndex}].stops[${stopIndex}].country`, 200),
      place: sanitizePlace(stop?.place, stop?.coordinates),
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
  const tags = input.tags && typeof input.tags === 'object' ? input.tags : {};
  return {
    title: cleanString(input.title, 'title', { min: 1, max: 120 }),
    description: cleanString(input.description, 'description', { min: 1, max: 5000 }),
    dayCount: sanitizedDays.length,
    distanceKm,
    tags: {
      difficulty: cleanOptionalString(tags.difficulty, 'tags.difficulty', 80),
      travelStyle: cleanOptionalString(tags.travelStyle, 'tags.travelStyle', 80),
      roadTrip: cleanStringArray(tags.roadTrip || [], 'tags.roadTrip'),
      experience: cleanStringArray(tags.experience || [], 'tags.experience'),
    },
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

async function listExistingRouteChildren(routeRef) {
  const daysSnapshot = await routeRef.collection('days').get();
  const stopsSnapshots = await Promise.all(
    daysSnapshot.docs.map((day) => day.ref.collection('stops').get())
  );
  return {
    days: daysSnapshot.docs,
    stops: stopsSnapshots.flatMap((snapshot) => snapshot.docs),
  };
}

async function saveRoute({ admin, auth, data, mediaBucket }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'Email verification is required.');
  const db = admin.firestore();
  const uid = auth.uid;
  const routeId = typeof data?.routeId === 'string' && data.routeId.trim()
    ? cleanDocumentId(data.routeId, 'routeId', '')
    : null;
  const routeRef = routeId ? db.doc(`routes/${routeId}`) : db.collection('routes').doc();
  const route = sanitizeRouteInput(data?.route);
  const requestedMedia = collectMedia(route.days);
  assert(requestedMedia.length <= MAX_ROUTE_MEDIA, 'invalid-argument', 'Route contains too many images.');
  if (requestedMedia.length) {
    assert(mediaBucket, 'failed-precondition', 'MEDIA_STORAGE_BUCKET is not configured.');
  }
  const validatedMedia = await validateMediaAssets({
    admin,
    uid,
    media: requestedMedia,
    mediaBucket,
    maxAssets: MAX_ROUTE_MEDIA,
  });
  const days = replaceValidatedMedia(route.days, validatedMedia);

  const existingSnapshot = await routeRef.get();
  if (routeId) {
    assert(existingSnapshot.exists, 'not-found', 'Route does not exist.');
    assert(
      existingSnapshot.data()?.ownerId === uid || auth.token?.admin === true,
      'permission-denied',
      'You do not own this route.'
    );
  }
  const existingChildren = existingSnapshot.exists
    ? await listExistingRouteChildren(routeRef)
    : { days: [], stops: [] };
  const writeCount = existingChildren.days.length + existingChildren.stops.length +
    days.length + days.reduce((sum, day) => sum + day.stops.length, 0) + 1;
  assert(writeCount <= 500, 'failed-precondition', 'Route is too large to save atomically.');

  const summaryPlaces = Array.from(new Set(days.flatMap((day) =>
    day.stops.map((stop) => stop.location || stop.place.name).filter(Boolean)
  ))).slice(0, 30);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  existingChildren.stops.forEach((entry) => batch.delete(entry.ref));
  existingChildren.days.forEach((entry) => batch.delete(entry.ref));
  days.forEach((day) => {
    const dayRef = routeRef.collection('days').doc(day.id);
    batch.set(dayRef, {
      position: day.position,
      description: day.description,
      media: day.media,
      stopCount: day.stops.length,
    });
    day.stops.forEach((stop) => {
      batch.set(dayRef.collection('stops').doc(stop.id), {
        position: stop.position,
        title: stop.title,
        description: stop.description,
        location: stop.location,
        country: stop.country,
        place: stop.place,
        media: stop.media,
      });
    });
  });
  batch.set(routeRef, {
    ownerId: existingSnapshot.exists ? existingSnapshot.data().ownerId : uid,
    title: route.title,
    description: route.description,
    status: 'active',
    dayCount: route.dayCount,
    distanceKm: route.distanceKm,
    tags: route.tags,
    summaryPlaces,
    media: validatedMedia,
    stats: existingSnapshot.exists
      ? existingSnapshot.data().stats || { likeCount: 0, commentCount: 0 }
      : { likeCount: 0, commentCount: 0 },
    createdAt: existingSnapshot.exists ? existingSnapshot.data().createdAt : now,
    updatedAt: now,
  });
  await batch.commit();
  return { routeId: routeRef.id };
}

async function loadRouteDetails({ admin, data }) {
  const routeId = cleanDocumentId(data?.routeId, 'routeId', '');
  const db = admin.firestore();
  const routeRef = db.doc(`routes/${routeId}`);
  const routeSnapshot = await routeRef.get();
  assert(routeSnapshot.exists && routeSnapshot.data()?.status === 'active', 'not-found', 'Route does not exist.');
  const daySnapshots = await routeRef.collection('days').orderBy('position').get();
  const days = await Promise.all(daySnapshots.docs.map(async (dayDocument) => {
    const stopsSnapshot = await dayDocument.ref.collection('stops').orderBy('position').get();
    return {
      id: dayDocument.id,
      ...dayDocument.data(),
      stops: stopsSnapshot.docs.map((stop) => ({ id: stop.id, ...stop.data() })),
    };
  }));
  return { route: { id: routeSnapshot.id, ...routeSnapshot.data(), days } };
}

module.exports = {
  MAX_ROUTE_DAYS,
  MAX_ROUTE_MEDIA,
  MAX_ROUTE_STOPS,
  collectMedia,
  loadRouteDetails,
  sanitizeRouteInput,
  saveRoute,
};
