const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const { isVerifiedCaller, normalizePublishRequestId } = require('./recommendationService');
const { saveRoute } = require('./routeService');
const { taxonomy } = require('./travelTaxonomy');

const MAX_ROUTE_DAYS = 60;
const MAX_ROUTE_STOPS = 150;
const DRAFT_REVISION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PUBLISHED_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

function draftError(code, reason, message) {
  return new HttpsError(code, message, { reason });
}

function assert(condition, code, reason, message) {
  if (!condition) throw draftError(code, reason, message);
}

function cleanString(value, field, { min = 0, max = 5000, optional = false } = {}) {
  if ((value == null || value === '') && optional) return '';
  assert(typeof value === 'string', 'invalid-argument', 'ROUTE_DRAFT_INVALID', `${field} must be a string.`);
  const result = value.trim();
  assert(result.length >= min && result.length <= max,
    'invalid-argument', 'ROUTE_DRAFT_INVALID', `${field} is invalid.`);
  return result;
}

function cleanId(value, field, { optional = false } = {}) {
  const result = cleanString(value, field, { min: optional ? 0 : 1, max: 180, optional });
  assert(!result || !result.includes('/'), 'invalid-argument', 'ROUTE_DRAFT_INVALID', `${field} is invalid.`);
  return result;
}

function cleanStringList(value, field, maximum) {
  const list = value == null ? [] : value;
  assert(Array.isArray(list) && list.length <= maximum,
    'invalid-argument', 'ROUTE_DRAFT_INVALID', `${field} is invalid.`);
  return Array.from(new Set(list.map((entry) => cleanString(entry, `${field} item`, { min: 1, max: 80 }))));
}

function cleanCoordinates(value, { optional = true } = {}) {
  if (value == null && optional) return null;
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  assert(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180,
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'coordinates are invalid.');
  return { lat, lng };
}

function cleanDestination(value, { optional = false } = {}) {
  if (value == null && optional) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'destination is invalid.');
  const providerPlaceId = cleanString(
    value.providerPlaceId || '', 'destination.providerPlaceId', { max: 300, optional: true }
  );
  const resolvedPlaceToken = providerPlaceId
    ? cleanString(value.resolvedPlaceToken || '', 'destination.resolvedPlaceToken', { max: 300, optional: true })
    : '';
  return {
    countryId: cleanId(value.countryId, 'destination.countryId'),
    cityId: cleanId(value.cityId, 'destination.cityId'),
    countryName: cleanString(value.countryName || '', 'destination.countryName', { max: 200, optional: true }),
    cityName: cleanString(value.cityName || value.name || '', 'destination.cityName', { max: 200, optional: true }),
    ...(providerPlaceId ? {
      provider: 'google',
      providerPlaceId,
      ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
    } : {}),
  };
}

function cleanPlace(value) {
  if (value == null) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'place is invalid.');
  const coordinates = cleanCoordinates(value.coordinates || value.geometry?.location);
  const placeId = cleanString(value.placeId || value.place_id || '', 'place.placeId', { max: 300, optional: true });
  const resolvedPlaceToken = cleanString(
    value.resolvedPlaceToken || '', 'place.resolvedPlaceToken', { max: 300, optional: true }
  );
  if (!coordinates && !placeId && !value.name && !value.address) return null;
  return {
    placeId,
    ...(resolvedPlaceToken ? { resolvedPlaceToken } : {}),
    name: cleanString(value.name || '', 'place.name', { max: 200, optional: true }),
    address: cleanString(value.address || '', 'place.address', { max: 500, optional: true }),
    ...(coordinates ? { coordinates } : {}),
  };
}

function cleanMedia(value) {
  if (value == null) return null;
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'media is invalid.');
  const assetId = cleanString(value.assetId || '', 'media.assetId', { max: 180, optional: true });
  if (!assetId) return null;
  const cleanVariant = (variant, name) => {
    if (!variant || typeof variant !== 'object') return null;
    const url = cleanString(variant.url || '', `media.${name}.url`, { max: 1000, optional: true });
    const path = cleanString(variant.path || '', `media.${name}.path`, { max: 500, optional: true });
    return url || path ? { ...(url ? { url } : {}), ...(path ? { path } : {}) } : null;
  };
  return {
    assetId,
    large: cleanVariant(value.large, 'large'),
    feed: cleanVariant(value.feed, 'feed'),
    thumb: cleanVariant(value.thumb, 'thumb'),
  };
}

function cleanDraftStop(value, dayIndex, stopIndex, fallbackDestination) {
  const stop = value && typeof value === 'object' ? value : {};
  const place = cleanPlace(stop.place);
  const coordinates = cleanCoordinates(stop.coordinates || place?.coordinates);
  const destination = cleanDestination(stop.destination || stop.destinationRef || fallbackDestination, { optional: true });
  const inferredPrecision = place?.placeId ? 'exact' : coordinates ? 'pin' : destination ? 'general' : '';
  const locationPrecision = cleanString(
    stop.locationPrecision || inferredPrecision, 'locationPrecision', { max: 20, optional: true }
  );
  assert(!locationPrecision || ['exact', 'pin', 'general'].includes(locationPrecision),
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'locationPrecision is invalid.');
  const startTime = cleanString(stop.startTime || '', 'startTime', { max: 5, optional: true });
  assert(!startTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime),
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'startTime is invalid.');
  const durationMinutes = stop.durationMinutes == null || stop.durationMinutes === ''
    ? null
    : Number(stop.durationMinutes);
  assert(durationMinutes == null || (Number.isSafeInteger(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 1440),
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'durationMinutes is invalid.');
  if (locationPrecision === 'exact') {
    assert(place?.placeId && coordinates,
      'invalid-argument', 'ROUTE_DRAFT_INVALID', 'An exact route stop requires a verified place.');
  } else if (locationPrecision === 'pin') {
    assert(coordinates && destination,
      'invalid-argument', 'ROUTE_DRAFT_INVALID', 'A pinned route stop requires coordinates and a destination.');
  } else if (locationPrecision === 'general') {
    assert(destination,
      'invalid-argument', 'ROUTE_DRAFT_INVALID', 'A general route stop requires a destination.');
  }
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
  const recommendationId = cleanId(
    stop.source?.recommendationId || stop.recommendationId || '',
    'recommendationId',
    { optional: true }
  );
  return {
    id: cleanId(stop.id || `stop_${dayIndex + 1}_${stopIndex + 1}`, 'stop.id'),
    position: stopIndex,
    title: cleanString(stop.title || '', 'stop.title', { max: 160, optional: true }),
    description: cleanString(stop.description || '', 'stop.description', { max: 3000, optional: true }),
    location: cleanString(stop.location || '', 'stop.location', { max: 200, optional: true }),
    country: cleanString(stop.country || '', 'stop.country', { max: 200, optional: true }),
    locationPrecision,
    ...(destination ? { destination } : {}),
    ...(canonicalPlace ? { place: canonicalPlace } : {}),
    ...(canonicalCoordinates ? { coordinates: canonicalCoordinates } : {}),
    ...(recommendationId ? { source: { type: 'recommendation', recommendationId } } : {}),
    startTime,
    durationMinutes,
    categoryId: cleanId(stop.categoryId || '', 'stop.categoryId', { optional: true }),
    subcategoryIds: cleanStringList(stop.subcategoryIds, 'stop.subcategoryIds', 3),
    media: cleanMedia(stop.media),
  };
}

function sanitizeRouteDraft(value) {
  const draft = value && typeof value === 'object' ? value : {};
  const area = cleanDestination(draft.area || draft.destination, { optional: true });
  const rawDays = Array.isArray(draft.days) ? draft.days : [];
  const requestedDayCount = Number(draft.dayCount || rawDays.length || 0);
  assert(Number.isSafeInteger(requestedDayCount) && requestedDayCount >= 1 && requestedDayCount <= MAX_ROUTE_DAYS,
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'dayCount is invalid.');
  const days = Array.from({ length: requestedDayCount }, (_, dayIndex) => {
    const day = rawDays[dayIndex] && typeof rawDays[dayIndex] === 'object' ? rawDays[dayIndex] : {};
    const stops = Array.isArray(day.stops) ? day.stops : [];
    return {
      id: `day_${String(dayIndex + 1).padStart(3, '0')}`,
      position: dayIndex,
      description: cleanString(day.description || '', 'day.description', { max: 5000, optional: true }),
      media: cleanMedia(day.media),
      stops: stops.map((stop, stopIndex) => cleanDraftStop(stop, dayIndex, stopIndex, area)),
    };
  });
  const stopCount = days.reduce((sum, day) => sum + day.stops.length, 0);
  assert(stopCount <= MAX_ROUTE_STOPS,
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'Route draft contains too many stops.');
  const attributes = draft.attributes && typeof draft.attributes === 'object' ? draft.attributes : {};
  return {
    routeSchemaVersion: 2,
    taxonomyVersion: taxonomy.version,
    area,
    dayCount: requestedDayCount,
    title: cleanString(draft.title || '', 'title', { max: 120, optional: true }),
    description: cleanString(draft.description || '', 'description', { max: 5000, optional: true }),
    categoryIds: cleanStringList(draft.categoryIds, 'categoryIds', 8),
    subcategoryIds: cleanStringList(draft.subcategoryIds, 'subcategoryIds', 20),
    attributes: {
      audienceScope: attributes.audienceScope === 'selected' ? 'selected' : 'all',
      audiences: cleanStringList(attributes.audiences, 'attributes.audiences', 6),
      budgetLevel: cleanId(attributes.budgetLevel || '', 'attributes.budgetLevel', { optional: true }),
      vibes: cleanStringList(attributes.vibes, 'attributes.vibes', 4),
      travelerStyles: cleanStringList(attributes.travelerStyles, 'attributes.travelerStyles', 4),
      needs: cleanStringList(attributes.needs, 'attributes.needs', 20),
      needsCoverageConfirmed: attributes.needsCoverageConfirmed === true,
      seasons: cleanStringList(attributes.seasons, 'attributes.seasons', 8),
      environment: cleanId(attributes.environment || '', 'attributes.environment', { optional: true }),
    },
    difficulty: cleanId(draft.difficulty || '', 'difficulty', { optional: true }),
    experienceLevel: cleanId(draft.experienceLevel || '', 'experienceLevel', { optional: true }),
    transportModes: cleanStringList(draft.transportModes, 'transportModes', 4),
    pace: cleanId(draft.pace || '', 'pace', { optional: true }),
    priceBasis: 'whole_route',
    priceNote: cleanString(draft.priceNote || '', 'priceNote', { max: 120, optional: true }),
    days,
  };
}

function draftPointerRef(db, uid) {
  return db.doc(`system/routeDrafts/owners/${uid}`);
}

function publishedReceiptRef(db, uid, draftId) {
  return db.doc(`system/routeDrafts/owners/${uid}/publications/${draftId}`);
}

async function cleanupPublishedRouteDraftReceipts({ admin, limit = 100, now = new Date() }) {
  const snapshot = await admin.firestore()
    .collectionGroup('publications')
    .where('expireAt', '<=', now)
    .limit(limit)
    .get();
  let deleted = 0;
  for (const receipt of snapshot.docs) {
    const segments = receipt.ref.path.split('/');
    if (
      segments.length !== 6 ||
      segments[0] !== 'system' ||
      segments[1] !== 'routeDrafts' ||
      segments[2] !== 'owners' ||
      segments[4] !== 'publications'
    ) continue;
    await receipt.ref.delete();
    deleted += 1;
  }
  return { scanned: snapshot.size, deleted };
}

async function assertEditableSource(db, sourceRouteId, uid) {
  if (!sourceRouteId) return null;
  const ref = db.doc(`routes/${sourceRouteId}`);
  const snapshot = await ref.get();
  assert(snapshot.exists, 'not-found', 'ROUTE_SOURCE_NOT_FOUND', 'Route does not exist.');
  const route = snapshot.data() || {};
  assert(route.ownerId === uid, 'permission-denied', 'ROUTE_SOURCE_FORBIDDEN', 'You do not own this route.');
  assert(['active', 'moderation_hold'].includes(route.status),
    'failed-precondition', 'ROUTE_SOURCE_UNAVAILABLE', 'Route cannot be edited right now.');
  return { ref, route };
}

async function readDraftRevision(db, pointer) {
  const revisionRef = db.doc(pointer.revisionPath);
  const revisionSnapshot = await revisionRef.get();
  assert(revisionSnapshot.exists, 'not-found', 'ROUTE_DRAFT_NOT_FOUND', 'Route draft does not exist.');
  const revision = revisionSnapshot.data() || {};
  const daySnapshots = await revisionRef.collection('days').orderBy('position').limit(MAX_ROUTE_DAYS + 1).get();
  assert(daySnapshots.size <= MAX_ROUTE_DAYS,
    'failed-precondition', 'ROUTE_DRAFT_INVALID', 'Route draft contains too many days.');
  const days = [];
  let stopCount = 0;
  for (const dayDocument of daySnapshots.docs) {
    const remaining = MAX_ROUTE_STOPS - stopCount;
    const stopsSnapshot = await dayDocument.ref.collection('stops').orderBy('position').limit(remaining + 1).get();
    assert(stopsSnapshot.size <= remaining,
      'failed-precondition', 'ROUTE_DRAFT_INVALID', 'Route draft contains too many stops.');
    stopCount += stopsSnapshot.size;
    days.push({
      id: dayDocument.id,
      ...dayDocument.data(),
      stops: stopsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
    });
  }
  return { revisionRef, revision, draft: { ...(revision.draft || {}), days } };
}

async function getCurrentRouteDraft({ admin, auth }) {
  assert(auth?.uid, 'unauthenticated', 'ROUTE_DRAFT_AUTH_REQUIRED', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'ROUTE_DRAFT_AUTH_REQUIRED', 'Email verification is required.');
  const db = admin.firestore();
  const pointerSnapshot = await draftPointerRef(db, auth.uid).get();
  if (!pointerSnapshot.exists) return { draft: null };
  const pointer = pointerSnapshot.data() || {};
  assert(pointer.ownerId === auth.uid, 'permission-denied', 'ROUTE_DRAFT_FORBIDDEN', 'Route draft is unavailable.');
  const loaded = await readDraftRevision(db, pointer);
  assert(loaded.revision.ownerId === auth.uid && loaded.revision.state === 'draft',
    'permission-denied', 'ROUTE_DRAFT_FORBIDDEN', 'Route draft is unavailable.');
  return {
    draft: {
      id: pointer.draftId,
      version: pointer.version,
      sourceRouteId: pointer.sourceRouteId || null,
      updatedAt: pointer.updatedAt || loaded.revision.updatedAt || null,
      ...loaded.draft,
    },
  };
}

async function saveRouteDraft({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'ROUTE_DRAFT_AUTH_REQUIRED', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'ROUTE_DRAFT_AUTH_REQUIRED', 'Email verification is required.');
  const db = admin.firestore();
  const uid = auth.uid;
  const incomingDraftId = cleanId(data?.draftId || '', 'draftId', { optional: true });
  const sourceRouteId = cleanId(data?.sourceRouteId || '', 'sourceRouteId', { optional: true });
  const expectedVersion = data?.expectedVersion == null ? null : Number(data.expectedVersion);
  assert(expectedVersion == null || (Number.isSafeInteger(expectedVersion) && expectedVersion >= 0),
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'expectedVersion is invalid.');
  await assertEditableSource(db, sourceRouteId, uid);
  const draft = sanitizeRouteDraft(data?.draft);
  assert(draft.area, 'invalid-argument', 'ROUTE_DRAFT_DESTINATION_REQUIRED', 'Choose a destination first.');

  const pointerRef = draftPointerRef(db, uid);
  const pointerSnapshot = await pointerRef.get();
  const current = pointerSnapshot.exists ? pointerSnapshot.data() || {} : null;
  if (current && !incomingDraftId) {
    throw draftError('already-exists', 'ROUTE_DRAFT_EXISTS', 'A route draft already exists.');
  }
  if (current) {
    assert(current.ownerId === uid && current.draftId === incomingDraftId,
      'permission-denied', 'ROUTE_DRAFT_FORBIDDEN', 'Route draft is unavailable.');
    assert(!sourceRouteId || current.sourceRouteId === sourceRouteId,
      'failed-precondition', 'ROUTE_DRAFT_SOURCE_MISMATCH', 'Route draft belongs to another route.');
    assert(expectedVersion == null || current.version === expectedVersion,
      'aborted', 'ROUTE_DRAFT_VERSION_CONFLICT', 'The route draft changed. Reload it and try again.');
  }

  const routeId = current?.routeId || sourceRouteId || db.collection('routes').doc().id;
  const routeRef = db.doc(`routes/${routeId}`);
  const revisionRef = routeRef.collection('revisions').doc();
  const nextVersion = (current?.version || 0) + 1;
  const draftId = current?.draftId || crypto.randomUUID();
  const publicationId = current?.publicationId || crypto.randomUUID();
  const publishRequestId = current?.publishRequestId || crypto.randomUUID();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const { days: draftDays, ...draftMetadata } = draft;
  const batch = db.batch();
  batch.create(revisionRef, {
    state: 'draft',
    ownerId: uid,
    draftId,
    draftVersion: nextVersion,
    sourceRouteId: sourceRouteId || current?.sourceRouteId || null,
    draft: draftMetadata,
    createdAt: now,
    updatedAt: now,
    expireAt: null,
  });
  draftDays.forEach((day) => {
    const dayRef = revisionRef.collection('days').doc(day.id);
    batch.create(dayRef, {
      position: day.position,
      description: day.description,
      media: day.media,
      stopCount: day.stops.length,
    });
    day.stops.forEach((stop) => batch.create(dayRef.collection('stops').doc(stop.id), stop));
  });
  await batch.commit();

  try {
    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(pointerRef);
      const latest = latestSnapshot.exists ? latestSnapshot.data() || {} : null;
      assert((latest?.draftId || '') === (current?.draftId || ''),
        'aborted', 'ROUTE_DRAFT_VERSION_CONFLICT', 'The route draft changed. Reload it and try again.');
      assert((latest?.version || 0) === (current?.version || 0),
        'aborted', 'ROUTE_DRAFT_VERSION_CONFLICT', 'The route draft changed. Reload it and try again.');
      transaction.set(pointerRef, {
        ownerId: uid,
        draftId,
        routeId,
        revisionPath: revisionRef.path,
        version: nextVersion,
        sourceRouteId: sourceRouteId || current?.sourceRouteId || null,
        publicationId,
        publishRequestId,
        createdAt: current?.createdAt || now,
        updatedAt: now,
      });
      if (current?.revisionPath) {
        transaction.update(db.doc(current.revisionPath), {
          expireAt: new Date(Date.now() + DRAFT_REVISION_TTL_MS),
          supersededAt: now,
        });
      }
    });
  } catch (error) {
    await revisionRef.set({ expireAt: new Date(Date.now() + DRAFT_REVISION_TTL_MS) }, { merge: true });
    throw error;
  }

  return { draftId, version: nextVersion, sourceRouteId: sourceRouteId || null };
}

async function discardRouteDraft({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'ROUTE_DRAFT_AUTH_REQUIRED', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'ROUTE_DRAFT_AUTH_REQUIRED', 'Email verification is required.');
  const draftId = cleanId(data?.draftId || '', 'draftId');
  const db = admin.firestore();
  const pointerRef = draftPointerRef(db, auth.uid);
  let revisionPath = '';
  await db.runTransaction(async (transaction) => {
    const pointerSnapshot = await transaction.get(pointerRef);
    assert(pointerSnapshot.exists, 'not-found', 'ROUTE_DRAFT_NOT_FOUND', 'Route draft does not exist.');
    const pointer = pointerSnapshot.data() || {};
    assert(pointer.ownerId === auth.uid && pointer.draftId === draftId,
      'permission-denied', 'ROUTE_DRAFT_FORBIDDEN', 'Route draft is unavailable.');
    revisionPath = pointer.revisionPath;
    transaction.update(db.doc(revisionPath), {
      expireAt: new Date(),
      discardedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.delete(pointerRef);
  });
  try {
    await db.recursiveDelete(db.doc(revisionPath));
  } catch (error) {
    console.error('route_draft_recursive_delete_failed', { uid: auth.uid, revisionPath });
  }
  return { discarded: true };
}

function publishableRoute(draft) {
  return {
    routeSchemaVersion: 2,
    taxonomyVersion: taxonomy.version,
    title: draft.title,
    description: draft.description,
    categoryIds: draft.categoryIds,
    subcategoryIds: draft.subcategoryIds,
    attributes: draft.attributes,
    difficulty: draft.difficulty,
    experienceLevel: draft.experienceLevel,
    transportModes: draft.transportModes,
    pace: draft.pace,
    priceBasis: 'whole_route',
    priceNote: draft.priceNote,
    days: draft.days,
  };
}

async function publishRouteDraft({
  admin,
  auth,
  data,
  mediaBucket,
  mapsKey,
  newPlacesKey,
  placesProvider,
  restCountriesKey,
  providerRateLimitKey,
}) {
  assert(auth?.uid, 'unauthenticated', 'ROUTE_DRAFT_AUTH_REQUIRED', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'ROUTE_DRAFT_AUTH_REQUIRED', 'Email verification is required.');
  const draftId = cleanId(data?.draftId || '', 'draftId');
  const expectedVersion = Number(data?.expectedVersion);
  assert(Number.isSafeInteger(expectedVersion) && expectedVersion >= 1,
    'invalid-argument', 'ROUTE_DRAFT_INVALID', 'expectedVersion is invalid.');
  const db = admin.firestore();
  const pointerRef = draftPointerRef(db, auth.uid);
  const pointerSnapshot = await pointerRef.get();
  if (!pointerSnapshot.exists) {
    const receiptSnapshot = await publishedReceiptRef(db, auth.uid, draftId).get();
    const receipt = receiptSnapshot.exists ? receiptSnapshot.data() || {} : null;
    assert(receipt && receipt.ownerId === auth.uid && receipt.version === expectedVersion,
      'not-found', 'ROUTE_DRAFT_NOT_FOUND', 'Route draft does not exist.');
    return { ...(receipt.result || {}), published: true, idempotentReplay: true };
  }
  const pointer = pointerSnapshot.data() || {};
  assert(pointer.ownerId === auth.uid && pointer.draftId === draftId,
    'permission-denied', 'ROUTE_DRAFT_FORBIDDEN', 'Route draft is unavailable.');
  assert(pointer.version === expectedVersion,
    'aborted', 'ROUTE_DRAFT_VERSION_CONFLICT', 'The route draft changed. Reload it and try again.');
  const loaded = await readDraftRevision(db, pointer);
  assert(loaded.revision.ownerId === auth.uid && loaded.revision.state === 'draft',
    'permission-denied', 'ROUTE_DRAFT_FORBIDDEN', 'Route draft is unavailable.');
  const route = publishableRoute(loaded.draft);
  const result = await saveRoute({
    admin,
    auth,
    data: {
      route,
      ...(pointer.sourceRouteId
        ? { routeId: pointer.sourceRouteId, draftPublicationId: pointer.publicationId }
        : { publishRequestId: normalizePublishRequestId(pointer.publishRequestId) }),
    },
    mediaBucket,
    mapsKey,
    newPlacesKey,
    placesProvider,
    restCountriesKey,
    providerRateLimitKey,
  });

  await db.runTransaction(async (transaction) => {
    const latestSnapshot = await transaction.get(pointerRef);
    const latest = latestSnapshot.exists ? latestSnapshot.data() || {} : null;
    if (latest?.draftId === draftId && latest?.version === expectedVersion) {
      transaction.set(publishedReceiptRef(db, auth.uid, draftId), {
        ownerId: auth.uid,
        draftId,
        version: expectedVersion,
        result,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: new Date(Date.now() + PUBLISHED_RECEIPT_TTL_MS),
      });
      transaction.update(loaded.revisionRef, {
        expireAt: new Date(),
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.delete(pointerRef);
    }
  });
  try {
    await db.recursiveDelete(loaded.revisionRef);
  } catch (error) {
    console.error('route_draft_recursive_delete_failed', {
      uid: auth.uid,
      revisionPath: loaded.revisionRef.path,
    });
  }
  return { ...result, published: true };
}

module.exports = {
  assertEditableSource,
  cleanupPublishedRouteDraftReceipts,
  discardRouteDraft,
  draftPointerRef,
  getCurrentRouteDraft,
  publishedReceiptRef,
  publishRouteDraft,
  publishableRoute,
  sanitizeRouteDraft,
  saveRouteDraft,
};
