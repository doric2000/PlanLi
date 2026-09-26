const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const { mapRecommendationPreview, getMapRecommendations } = require('./mapRecommendationsService');
const { consumeProviderBudget } = require('./providerRateLimitService');
const { billingProjectId, getGoogleRoutesAccessToken } = require('./googleRoutesOAuth');
const { computeRouteChunks } = require('./tripRouteService');
const {
  MAX_DAY_STOPS,
  MAX_TRIP_DAYS,
  MAX_TRIP_STOPS,
  TRIP_KIND,
  TRIP_SCHEMA_VERSION,
  assertPlanner,
  cleanId,
  cleanOperationId,
  cleanOperations,
  cleanString,
  normalizeLimit,
} = require('./tripPlannerValidation');

const SHARE_TOKEN_BYTES = 32;
const publicLinks = require('./publicLinks');
const SHARE_BASE_URL = `${publicLinks.origin}/${publicLinks.paths.trip}`;
const DEEP_LINK_BASE_URL = 'com.planli.planlitravels://shared-trip';
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REVOKED_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_TRIPS_PER_USER = 50;
const DEFAULT_NEAR_ROUTE_KM = 30;

function timestamp(admin) {
  return admin.firestore.FieldValue.serverTimestamp();
}

function deleteField(admin) {
  return admin.firestore.FieldValue.delete();
}

function snapshotValue(snapshot) {
  return snapshot?.exists ? snapshot.data() : null;
}

function assertPrivateTrip(trip, uid, { allowDeleting = false } = {}) {
  assertPlanner(trip && trip.kind === TRIP_KIND,
    'not-found', 'Trip does not exist.', 'TRIP_NOT_FOUND');
  assertPlanner(trip.ownerId === uid,
    'permission-denied', 'You do not own this trip.', 'TRIP_NOT_OWNED');
  assertPlanner(allowDeleting || trip.state === 'active',
    'failed-precondition', 'This trip is being deleted.', 'TRIP_DELETING');
}

function operationReceiptId(uid, tripId, operationId, key) {
  return crypto.createHmac('sha256', key || 'local-development-key')
    .update(`${uid}:${tripId}:${operationId}`)
    .digest('base64url');
}

function tripQuotaId(uid, key) {
  return crypto.createHmac('sha256', key || 'local-development-key')
    .update(`trip-quota:${uid}`)
    .digest('base64url');
}

function tripQuotaRef(db, uid, key) {
  return db.doc(`system/tripPlannerQuotas/accounts/${tripQuotaId(uid, key)}`);
}

function activeTripCount(quota) {
  return Math.max(0, Number(quota?.activeTripCount) || 0);
}

function assertTripAllocationAvailable(quota) {
  const count = activeTripCount(quota);
  assertPlanner(count < MAX_ACTIVE_TRIPS_PER_USER,
    'resource-exhausted',
    `An account can contain up to ${MAX_ACTIVE_TRIPS_PER_USER} active trips.`,
    'TRIP_LIMIT_REACHED');
  return count;
}

function revokedShareFields(admin, now) {
  return {
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
    expireAt: new Date(Date.now() + REVOKED_SHARE_TTL_MS),
  };
}

function shareTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('base64url');
}

function cleanShareToken(value) {
  const token = cleanString(value, 'token', 128);
  assertPlanner(/^[A-Za-z0-9_-]{40,128}$/.test(token),
    'invalid-argument', 'Share token is invalid.', 'INVALID_SHARE_TOKEN');
  return token;
}

function recommendationStop(document, order, now) {
  const preview = mapRecommendationPreview({ id: document?.id, ...(document?.data?.() || {}) });
  assertPlanner(preview,
    'failed-precondition', 'A selected recommendation has no routable location.',
    'RECOMMENDATION_LOCATION_UNAVAILABLE');
  const data = document.data();
  assertPlanner(
    data?.status === 'active' && data?.publicationGate?.destinationApprovalVerified === true,
    'failed-precondition',
    'A selected recommendation is no longer available.',
    'RECOMMENDATION_UNAVAILABLE'
  );
  const coordinates = preview.place.coordinates;
  return {
    sourceType: 'recommendation',
    recommendationId: document.id,
    order,
    title: preview.title || 'המלצה',
    subtitle: preview.place.address || preview.destination.cityName || '',
    locationMode: 'exact',
    coordinates: { lat: Number(coordinates.lat), lng: Number(coordinates.lng) },
    destination: preview.destination,
    media: preview.media,
    createdAt: now,
    updatedAt: now,
  };
}

function customStop(value, order, now) {
  return {
    sourceType: 'custom',
    order,
    title: value.title,
    subtitle: value.subtitle,
    note: value.note,
    locationMode: value.locationMode,
    coordinates: value.coordinates,
    ...(value.placeId ? { placeId: value.placeId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function dayDocument({ kind, title, order, date = null, travelMode = 'DRIVE', stopCount = 0, now }) {
  return {
    kind,
    title,
    order,
    date,
    travelMode,
    stopCount,
    nextStopOrder: stopCount,
    createdAt: now,
    updatedAt: now,
  };
}

async function createPrivateTrip({ admin, auth, data, idempotencyKey }) {
  const uid = auth?.uid;
  assertPlanner(uid, 'unauthenticated', 'You must be signed in.', 'SIGN_IN_REQUIRED');
  const title = cleanString(data?.title || 'הטיול החדש שלי', 'title', 120);
  const seedRecommendationId = data?.seedRecommendationId
    ? cleanId(data.seedRecommendationId, 'seedRecommendationId')
    : null;
  const db = admin.firestore();
  const tripRef = db.collection('trips').doc();
  const ideasRef = tripRef.collection('days').doc();
  const firstDayRef = tripRef.collection('days').doc();
  const seedSnapshot = seedRecommendationId
    ? await db.doc(`recommendations/${seedRecommendationId}`).get()
    : null;
  const now = timestamp(admin);
  const quotaRef = tripQuotaRef(db, uid, idempotencyKey);
  let seedStopId = null;
  let seedStopRef = null;
  if (seedSnapshot) {
    seedStopRef = ideasRef.collection('stops').doc();
    seedStopId = seedStopRef.id;
  }
  await db.runTransaction(async (transaction) => {
    const quota = snapshotValue(await transaction.get(quotaRef));
    const count = assertTripAllocationAvailable(quota);
    transaction.set(tripRef, {
      schemaVersion: TRIP_SCHEMA_VERSION,
      kind: TRIP_KIND,
      ownerId: uid,
      title,
      state: 'active',
      ideasDayId: ideasRef.id,
      dayCount: 1,
      nextDayOrder: 2,
      stopCount: seedSnapshot ? 1 : 0,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    });
    transaction.set(ideasRef, dayDocument({
      kind: 'ideas', title: 'רעיונות', order: 0,
      stopCount: seedSnapshot ? 1 : 0, now,
    }));
    transaction.set(firstDayRef, dayDocument({ kind: 'day', title: 'יום 1', order: 1, now }));
    if (seedStopRef) transaction.set(seedStopRef, recommendationStop(seedSnapshot, 0, now));
    transaction.set(quotaRef, {
      ownerId: uid,
      activeTripCount: count + 1,
      updatedAt: now,
      ...(quota ? {} : { createdAt: now }),
    }, { merge: true });
  });
  return {
    tripId: tripRef.id,
    ideasDayId: ideasRef.id,
    firstDayId: firstDayRef.id,
    revision: 1,
    ...(seedStopId ? { seedStopId } : {}),
  };
}

function compactTripListItem(document) {
  const data = document.data();
  return {
    id: document.id,
    title: data.title,
    dayCount: Math.max(0, Number(data.dayCount) || 0),
    stopCount: Math.max(0, Number(data.stopCount) || 0),
    ideasDayId: data.ideasDayId,
    revision: Math.max(1, Number(data.revision) || 1),
    updatedAt: data.updatedAt || null,
    lastOpenedAt: data.lastOpenedAt || null,
    shareActive: Boolean(data.activeShareHash),
  };
}

async function listMyTrips({ admin, auth, data }) {
  const limit = normalizeLimit(data?.limit, 30, 50);
  const snapshot = await admin.firestore().collection('trips')
    .where('ownerId', '==', auth.uid)
    .where('state', '==', 'active')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  return { items: snapshot.docs.map(compactTripListItem), count: snapshot.size };
}

async function loadTripGraph(db, tripRef, rootData = null) {
  const root = rootData || snapshotValue(await tripRef.get());
  assertPlanner(root, 'not-found', 'Trip does not exist.', 'TRIP_NOT_FOUND');
  const daysSnapshot = await tripRef.collection('days').orderBy('order').get();
  const days = await Promise.all(daysSnapshot.docs.map(async (daySnapshot) => {
    const stopsSnapshot = await daySnapshot.ref.collection('stops').orderBy('order').get();
    return {
      id: daySnapshot.id,
      ...daySnapshot.data(),
      stops: stopsSnapshot.docs.map((stopSnapshot) => ({ id: stopSnapshot.id, ...stopSnapshot.data() })),
    };
  }));
  return {
    id: tripRef.id,
    title: root.title,
    dayCount: root.dayCount,
    stopCount: root.stopCount,
    revision: root.revision,
    ideasDayId: root.ideasDayId,
    shareActive: Boolean(root.activeShareHash),
    createdAt: root.createdAt || null,
    updatedAt: root.updatedAt || null,
    lastOpenedAt: root.lastOpenedAt || null,
    days,
  };
}

async function getPrivateTrip({ admin, auth, data }) {
  const tripId = cleanId(data?.tripId, 'tripId');
  const db = admin.firestore();
  const tripRef = db.doc(`trips/${tripId}`);
  const snapshot = await tripRef.get();
  const trip = snapshotValue(snapshot);
  assertPrivateTrip(trip, auth.uid);
  return loadTripGraph(db, tripRef, trip);
}

function prepareOperations(tripRef, operations) {
  return operations.map((operation) => {
    if (operation.type === 'add_day') {
      return { ...operation, createdDayId: operation.clientId || tripRef.collection('days').doc().id };
    }
    if (operation.type === 'add_custom_stop') {
      return {
        ...operation,
        createdStopId: operation.clientId
          || tripRef.collection('days').doc(operation.dayId).collection('stops').doc().id,
      };
    }
    if (operation.type === 'add_recommendation_stops') {
      return {
        ...operation,
        createdStopIds: operation.clientStopIds || operation.recommendationIds.map(() => (
          tripRef.collection('days').doc(operation.dayId).collection('stops').doc().id
        )),
      };
    }
    if (operation.type === 'move_stop') {
      return { ...operation, movedStopId: operation.stopId };
    }
    return operation;
  });
}

async function applyPrivateTripOperations({ admin, auth, data, idempotencyKey }) {
  const tripId = cleanId(data?.tripId, 'tripId');
  const operationId = cleanOperationId(data?.operationId);
  const expectedRevision = Number(data?.expectedRevision);
  assertPlanner(Number.isInteger(expectedRevision) && expectedRevision >= 1,
    'invalid-argument', 'expectedRevision is invalid.', 'INVALID_REVISION');
  const operations = cleanOperations(data?.operations);
  const db = admin.firestore();
  const tripRef = db.doc(`trips/${tripId}`);
  const receiptId = operationReceiptId(auth.uid, tripId, operationId, idempotencyKey);
  const receiptRef = db.doc(`system/runtime/tripOperationReceipts/${receiptId}`);
  const prepared = prepareOperations(tripRef, operations);
  return db.runTransaction(async (transaction) => {
    const references = new Map([[receiptRef.path, receiptRef], [tripRef.path, tripRef]]);
    const dayRef = (dayId) => tripRef.collection('days').doc(dayId);
    const stopRef = (dayId, stopId) => dayRef(dayId).collection('stops').doc(stopId);
    const recommendationRef = (id) => db.doc(`recommendations/${id}`);
    prepared.forEach((operation) => {
      const targetDayId = operation.type === 'add_day' ? operation.createdDayId : operation.dayId;
      if (targetDayId) references.set(dayRef(targetDayId).path, dayRef(targetDayId));
      if (operation.targetDayId) {
        references.set(dayRef(operation.targetDayId).path, dayRef(operation.targetDayId));
        references.set(stopRef(operation.targetDayId, operation.movedStopId).path,
          stopRef(operation.targetDayId, operation.movedStopId));
      }
      if (operation.stopId) references.set(stopRef(operation.dayId, operation.stopId).path,
        stopRef(operation.dayId, operation.stopId));
      (operation.stopIds || []).forEach((id) => references.set(stopRef(operation.dayId, id).path,
        stopRef(operation.dayId, id)));
      (operation.recommendationIds || []).forEach((id) => references.set(recommendationRef(id).path,
        recommendationRef(id)));
      if (operation.createdStopId) references.set(stopRef(operation.dayId, operation.createdStopId).path,
        stopRef(operation.dayId, operation.createdStopId));
      (operation.createdStopIds || []).forEach((id) => references.set(stopRef(operation.dayId, id).path,
        stopRef(operation.dayId, id)));
    });
    const refs = Array.from(references.values());
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const byPath = new Map(snapshots.map((snapshot, index) => [refs[index].path, snapshot]));
    const receipt = byPath.get(receiptRef.path);
    if (receipt.exists) {
      const previous = receipt.data();
      assertPlanner(previous.uid === auth.uid && previous.tripId === tripId,
        'permission-denied', 'Operation receipt is invalid.', 'INVALID_OPERATION_RECEIPT');
      return previous.result;
    }
    const trip = snapshotValue(byPath.get(tripRef.path));
    assertPrivateTrip(trip, auth.uid);
    assertPlanner(Number(trip.revision) === expectedRevision,
      'aborted', 'The trip changed on another device.', 'REVISION_CONFLICT');

    const now = timestamp(admin);
    const dayStates = new Map();
    const getDayState = (id) => {
      if (!dayStates.has(id)) {
        const ref = dayRef(id);
        const snapshot = byPath.get(ref.path);
        dayStates.set(id, {
          ref,
          exists: Boolean(snapshot?.exists),
          originalExists: Boolean(snapshot?.exists),
          deleted: false,
          data: snapshot?.exists ? { ...snapshot.data() } : null,
          dirty: false,
        });
      }
      return dayStates.get(id);
    };
    let nextTitle = trip.title;
    let dayCount = Number(trip.dayCount) || 0;
    let nextDayOrder = Math.max(dayCount + 1, Number(trip.nextDayOrder) || 0);
    let stopCount = Number(trip.stopCount) || 0;
    const createdDayIds = [];
    const createdStopIds = [];

    for (const operation of prepared) {
      if (operation.type === 'set_title') {
        nextTitle = operation.title;
        continue;
      }
      if (operation.type === 'add_day') {
        const state = getDayState(operation.createdDayId);
        assertPlanner(!state.exists, 'already-exists', 'Day already exists.', 'DAY_ALREADY_EXISTS');
        assertPlanner(dayCount < MAX_TRIP_DAYS,
          'resource-exhausted', 'A trip can contain up to 14 days.', 'DAY_LIMIT_REACHED');
        dayCount += 1;
        state.exists = true;
        state.dirty = true;
        state.data = dayDocument({
          kind: 'day', title: operation.title, order: nextDayOrder,
          date: operation.date, travelMode: operation.travelMode, now,
        });
        nextDayOrder += 1;
        createdDayIds.push(operation.createdDayId);
        continue;
      }
      const day = getDayState(operation.dayId);
      assertPlanner(day.exists && !day.deleted,
        'not-found', 'Day does not exist.', 'DAY_NOT_FOUND');
      if (operation.type === 'update_day') {
        assertPlanner(day.data.kind === 'day',
          'failed-precondition', 'The ideas bucket cannot be edited as a day.', 'IDEAS_DAY_IMMUTABLE');
        const { type, dayId, ...updates } = operation;
        day.data = { ...day.data, ...updates, updatedAt: now };
        day.dirty = true;
        continue;
      }
      if (operation.type === 'delete_day') {
        assertPlanner(day.data.kind === 'day',
          'failed-precondition', 'The ideas bucket cannot be deleted.', 'IDEAS_DAY_IMMUTABLE');
        assertPlanner(Number(day.data.stopCount) === 0,
          'failed-precondition', 'Move or delete the stops before deleting this day.', 'DAY_NOT_EMPTY');
        assertPlanner(dayCount > 1,
          'failed-precondition', 'A trip must contain at least one day.', 'LAST_DAY_REQUIRED');
        day.deleted = true;
        day.exists = false;
        day.dirty = true;
        dayCount -= 1;
        continue;
      }
      if (operation.type === 'add_recommendation_stops') {
        const amount = operation.recommendationIds.length;
        assertPlanner(Number(day.data.stopCount) + amount <= MAX_DAY_STOPS
          && stopCount + amount <= MAX_TRIP_STOPS,
        'resource-exhausted', 'This trip contains too many stops.', 'STOP_LIMIT_REACHED');
        operation.recommendationIds.forEach((recommendationId, index) => {
          const rec = byPath.get(recommendationRef(recommendationId).path);
          const ref = stopRef(operation.dayId, operation.createdStopIds[index]);
          assertPlanner(!byPath.get(ref.path)?.exists,
            'already-exists', 'Stop already exists.', 'STOP_ALREADY_EXISTS');
          const order = Number(day.data.nextStopOrder) || Number(day.data.stopCount) || 0;
          transaction.set(ref, recommendationStop(rec, order, now));
          day.data.nextStopOrder = order + 1;
          day.data.stopCount = Number(day.data.stopCount) + 1;
          stopCount += 1;
          createdStopIds.push(ref.id);
        });
        day.data.updatedAt = now;
        day.dirty = true;
        continue;
      }
      if (operation.type === 'add_custom_stop') {
        assertPlanner(Number(day.data.stopCount) < MAX_DAY_STOPS && stopCount < MAX_TRIP_STOPS,
          'resource-exhausted', 'This trip contains too many stops.', 'STOP_LIMIT_REACHED');
        const ref = stopRef(operation.dayId, operation.createdStopId);
        assertPlanner(!byPath.get(ref.path)?.exists,
          'already-exists', 'Stop already exists.', 'STOP_ALREADY_EXISTS');
        const order = Number(day.data.nextStopOrder) || Number(day.data.stopCount) || 0;
        transaction.set(ref, customStop(operation.stop, order, now));
        day.data.nextStopOrder = order + 1;
        day.data.stopCount = Number(day.data.stopCount) + 1;
        day.data.updatedAt = now;
        day.dirty = true;
        stopCount += 1;
        createdStopIds.push(ref.id);
        continue;
      }
      if (operation.type === 'reorder_stops') {
        assertPlanner(operation.stopIds.length === Number(day.data.stopCount),
          'invalid-argument', 'The stop order is incomplete.', 'INVALID_STOP_ORDER');
        operation.stopIds.forEach((id, index) => {
          const ref = stopRef(operation.dayId, id);
          assertPlanner(byPath.get(ref.path)?.exists,
            'not-found', 'A stop in the new order no longer exists.', 'STOP_NOT_FOUND');
          transaction.update(ref, { order: index, updatedAt: now });
        });
        day.data.nextStopOrder = operation.stopIds.length;
        day.data.updatedAt = now;
        day.dirty = true;
        continue;
      }
      const ref = stopRef(operation.dayId, operation.stopId);
      const stopSnapshot = byPath.get(ref.path);
      assertPlanner(stopSnapshot?.exists,
        'not-found', 'Stop does not exist.', 'STOP_NOT_FOUND');
      if (operation.type === 'move_stop') {
        const targetDay = getDayState(operation.targetDayId);
        assertPlanner(targetDay.exists && !targetDay.deleted,
          'not-found', 'Target day does not exist.', 'DAY_NOT_FOUND');
        assertPlanner(Number(targetDay.data.stopCount) < MAX_DAY_STOPS,
          'resource-exhausted', 'The target day contains too many stops.', 'STOP_LIMIT_REACHED');
        const targetRef = stopRef(operation.targetDayId, operation.movedStopId);
        assertPlanner(!byPath.get(targetRef.path)?.exists,
          'already-exists', 'Stop already exists in target day.', 'STOP_ALREADY_EXISTS');
        const targetOrder = Number(targetDay.data.nextStopOrder) || Number(targetDay.data.stopCount) || 0;
        const { createdAt, ...moved } = stopSnapshot.data();
        transaction.set(targetRef, { ...moved, order: targetOrder, createdAt: createdAt || now, updatedAt: now });
        transaction.delete(ref);
        day.data.stopCount = Math.max(0, Number(day.data.stopCount) - 1);
        day.data.updatedAt = now;
        day.dirty = true;
        targetDay.data.stopCount = Number(targetDay.data.stopCount) + 1;
        targetDay.data.nextStopOrder = targetOrder + 1;
        targetDay.data.updatedAt = now;
        targetDay.dirty = true;
      } else if (operation.type === 'update_custom_stop') {
        assertPlanner(stopSnapshot.data()?.sourceType === 'custom',
          'failed-precondition', 'PlanLi recommendations cannot be overwritten.', 'RECOMMENDATION_STOP_IMMUTABLE');
        transaction.update(ref, {
          ...customStop(operation.stop, Number(stopSnapshot.data().order) || 0, stopSnapshot.data().createdAt || now),
          updatedAt: now,
        });
      } else if (operation.type === 'delete_stop') {
        transaction.delete(ref);
        day.data.stopCount = Math.max(0, Number(day.data.stopCount) - 1);
        day.data.updatedAt = now;
        day.dirty = true;
        stopCount = Math.max(0, stopCount - 1);
      }
    }

    assertPlanner(dayCount >= 1 && dayCount <= MAX_TRIP_DAYS,
      'failed-precondition', 'Trip day count is invalid.', 'INVALID_DAY_COUNT');
    assertPlanner(stopCount >= 0 && stopCount <= MAX_TRIP_STOPS,
      'failed-precondition', 'Trip stop count is invalid.', 'INVALID_STOP_COUNT');
    dayStates.forEach((state) => {
      if (!state.dirty) return;
      if (state.deleted) transaction.delete(state.ref);
      else if (state.originalExists) transaction.update(state.ref, state.data);
      else transaction.set(state.ref, state.data);
    });
    const result = {
      tripId,
      revision: expectedRevision + 1,
      createdDayIds,
      createdStopIds,
    };
    transaction.update(tripRef, {
      title: nextTitle,
      dayCount,
      nextDayOrder,
      stopCount,
      revision: result.revision,
      updatedAt: now,
      lastOpenedAt: now,
    });
    transaction.set(receiptRef, {
      uid: auth.uid,
      tripId,
      operationId,
      result,
      createdAt: now,
      expireAt: new Date(Date.now() + RECEIPT_TTL_MS),
    });
    return result;
  });
}

async function deletePrivateTrip({ admin, auth, data, idempotencyKey }) {
  const tripId = cleanId(data?.tripId, 'tripId');
  const db = admin.firestore();
  const tripRef = db.doc(`trips/${tripId}`);
  const quotaRef = tripQuotaRef(db, auth.uid, idempotencyKey);
  await db.runTransaction(async (transaction) => {
    const [tripSnapshot, quotaSnapshot] = await Promise.all([
      transaction.get(tripRef),
      transaction.get(quotaRef),
    ]);
    const trip = snapshotValue(tripSnapshot);
    assertPrivateTrip(trip, auth.uid, { allowDeleting: true });
    if (trip.state !== 'deleting') {
      const quota = snapshotValue(quotaSnapshot);
      const count = activeTripCount(quota);
      const now = timestamp(admin);
      transaction.update(tripRef, { state: 'deleting', updatedAt: now });
      transaction.set(quotaRef, {
        ownerId: auth.uid,
        activeTripCount: Math.max(0, count - 1),
        updatedAt: now,
        ...(quota ? {} : { createdAt: now }),
      }, { merge: true });
      if (trip.activeShareHash) {
        transaction.set(db.doc(`system/runtime/tripShareTokens/${trip.activeShareHash}`),
          revokedShareFields(admin, now), { merge: true });
      }
    }
  });
  assertPlanner(typeof db.recursiveDelete === 'function',
    'failed-precondition', 'Trip deletion is temporarily unavailable.', 'RECURSIVE_DELETE_UNAVAILABLE');
  await db.recursiveDelete(tripRef);
  return { tripId, deleted: true };
}

async function createTripShare({ admin, auth, data }) {
  const tripId = cleanId(data?.tripId, 'tripId');
  const db = admin.firestore();
  const tripRef = db.doc(`trips/${tripId}`);
  const token = crypto.randomBytes(SHARE_TOKEN_BYTES).toString('base64url');
  const tokenHash = shareTokenHash(token);
  const now = timestamp(admin);
  await db.runTransaction(async (transaction) => {
    const trip = snapshotValue(await transaction.get(tripRef));
    assertPrivateTrip(trip, auth.uid);
    if (trip.activeShareHash) {
      transaction.set(db.doc(`system/runtime/tripShareTokens/${trip.activeShareHash}`),
        revokedShareFields(admin, now), { merge: true });
    }
    transaction.set(db.doc(`system/runtime/tripShareTokens/${tokenHash}`), {
      tripId, ownerId: auth.uid, status: 'active', createdAt: now, updatedAt: now,
    });
    transaction.update(tripRef, { activeShareHash: tokenHash, updatedAt: now });
  });
  return {
    tripId,
    shareUrl: publicLinks.shareUrl('trip', token),
    deepLink: `${DEEP_LINK_BASE_URL}/${token}`,
  };
}

async function revokeTripShare({ admin, auth, data }) {
  const tripId = cleanId(data?.tripId, 'tripId');
  const db = admin.firestore();
  const tripRef = db.doc(`trips/${tripId}`);
  const now = timestamp(admin);
  return db.runTransaction(async (transaction) => {
    const trip = snapshotValue(await transaction.get(tripRef));
    assertPrivateTrip(trip, auth.uid);
    if (!trip.activeShareHash) return { tripId, revoked: false };
    transaction.set(db.doc(`system/runtime/tripShareTokens/${trip.activeShareHash}`),
      revokedShareFields(admin, now), { merge: true });
    transaction.update(tripRef, { activeShareHash: deleteField(admin), updatedAt: now });
    return { tripId, revoked: true };
  });
}

async function sharedTripContext(admin, tokenValue) {
  const token = cleanShareToken(tokenValue);
  const db = admin.firestore();
  const tokenHash = shareTokenHash(token);
  const shareRef = db.doc(`system/runtime/tripShareTokens/${tokenHash}`);
  const share = snapshotValue(await shareRef.get());
  assertPlanner(share?.status === 'active',
    'not-found', 'This private link is no longer available.', 'SHARE_NOT_AVAILABLE');
  const tripRef = db.doc(`trips/${cleanId(share.tripId, 'share.tripId')}`);
  const trip = snapshotValue(await tripRef.get());
  assertPlanner(trip?.kind === TRIP_KIND && trip?.state === 'active'
    && trip?.activeShareHash === tokenHash,
  'not-found', 'This private link is no longer available.', 'SHARE_NOT_AVAILABLE');
  return { db, shareRef, tripRef, trip, share, tokenHash };
}

async function getSharedTrip({ admin, data }) {
  const context = await sharedTripContext(admin, data?.token);
  const graph = await loadTripGraph(context.db, context.tripRef, context.trip);
  const owner = snapshotValue(await context.db.doc(`publicProfiles/${context.share.ownerId}`).get());
  return {
    ...graph,
    shared: {
      readOnly: true,
      canCopy: true,
      owner: owner ? { displayName: owner.displayName || 'מטייל/ת', photoURL: owner.photoURL || null } : null,
    },
  };
}

async function copySharedTrip({ admin, auth, data, idempotencyKey }) {
  assertPlanner(auth?.uid, 'unauthenticated', 'You must be signed in.', 'SIGN_IN_REQUIRED');
  const context = await sharedTripContext(admin, data?.token);
  const graph = await loadTripGraph(context.db, context.tripRef, context.trip);
  const newTripRef = context.db.collection('trips').doc();
  const now = timestamp(admin);
  const quotaRef = tripQuotaRef(context.db, auth.uid, idempotencyKey);
  await context.db.runTransaction(async (transaction) => {
    const [quotaSnapshot, shareSnapshot, sourceTripSnapshot] = await Promise.all([
      transaction.get(quotaRef),
      transaction.get(context.shareRef),
      transaction.get(context.tripRef),
    ]);
    const quota = snapshotValue(quotaSnapshot);
    const share = snapshotValue(shareSnapshot);
    const sourceTrip = snapshotValue(sourceTripSnapshot);
    const count = assertTripAllocationAvailable(quota);
    assertPlanner(share?.status === 'active'
      && sourceTrip?.kind === TRIP_KIND
      && sourceTrip?.state === 'active'
      && sourceTrip?.activeShareHash === context.tokenHash
      && Number(sourceTrip.revision) === Number(graph.revision),
    'not-found', 'This private link is no longer available.', 'SHARE_NOT_AVAILABLE');
    transaction.set(newTripRef, {
      schemaVersion: TRIP_SCHEMA_VERSION,
      kind: TRIP_KIND,
      ownerId: auth.uid,
      title: cleanString(`עותק של ${graph.title}`, 'title', 120),
      state: 'active',
      ideasDayId: graph.ideasDayId,
      dayCount: graph.dayCount,
      nextDayOrder: Math.max(graph.dayCount + 1, Number(context.trip.nextDayOrder) || 0),
      stopCount: graph.stopCount,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    });
    graph.days.forEach((day) => {
      const dayRef = newTripRef.collection('days').doc(day.id);
      transaction.set(dayRef, {
        kind: day.kind,
        title: day.title,
        order: day.order,
        date: day.date || null,
        travelMode: day.travelMode,
        stopCount: day.stopCount,
        nextStopOrder: day.nextStopOrder || day.stopCount,
        createdAt: now,
        updatedAt: now,
      });
      day.stops.forEach((stop) => {
        const { id, createdAt, updatedAt, ...copy } = stop;
        transaction.set(dayRef.collection('stops').doc(id), { ...copy, createdAt: now, updatedAt: now });
      });
    });
    transaction.set(quotaRef, {
      ownerId: auth.uid,
      activeTripCount: count + 1,
      updatedAt: now,
      ...(quota ? {} : { createdAt: now }),
    }, { merge: true });
  });
  return { tripId: newTripRef.id, revision: 1 };
}

function projectPointDistanceKm(point, start, end) {
  const latitudeScale = 111.32;
  const longitudeScale = Math.max(1,
    Math.cos(((start.lat + end.lat + point.lat) / 3) * Math.PI / 180) * 111.32);
  const ax = start.lng * longitudeScale;
  const ay = start.lat * latitudeScale;
  const bx = end.lng * longitudeScale;
  const by = end.lat * latitudeScale;
  const px = point.lng * longitudeScale;
  const py = point.lat * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceFromPathKm(point, path) {
  if (!path.length) return Infinity;
  if (path.length === 1) return projectPointDistanceKm(point, path[0], path[0]);
  let result = Infinity;
  for (let index = 1; index < path.length; index += 1) {
    result = Math.min(result, projectPointDistanceKm(point, path[index - 1], path[index]));
  }
  return result;
}

async function discoverTripRecommendations({ admin, auth, data }) {
  const tripId = cleanId(data?.tripId, 'tripId');
  const db = admin.firestore();
  const tripRef = db.doc(`trips/${tripId}`);
  const trip = snapshotValue(await tripRef.get());
  assertPrivateTrip(trip, auth.uid);
  const result = await getMapRecommendations({ admin, data });
  if (data?.nearRoute !== true) return result;
  const dayId = cleanId(data?.dayId || trip.ideasDayId, 'dayId');
  const daySnapshot = await tripRef.collection('days').doc(dayId).get();
  assertPlanner(daySnapshot.exists, 'not-found', 'Day does not exist.', 'DAY_NOT_FOUND');
  const stopsSnapshot = await daySnapshot.ref.collection('stops').orderBy('order').get();
  const path = stopsSnapshot.docs.map((entry) => entry.data()?.coordinates).filter((coordinates) => (
    coordinates && Number.isFinite(Number(coordinates.lat)) && Number.isFinite(Number(coordinates.lng))
  )).map((coordinates) => ({ lat: Number(coordinates.lat), lng: Number(coordinates.lng) }));
  const maximumKm = Math.max(1, Math.min(100, Number(data?.maxDetourKm) || DEFAULT_NEAR_ROUTE_KM));
  const items = result.items.map((item) => {
    const coordinates = item?.place?.coordinates;
    const detourKm = coordinates ? distanceFromPathKm(coordinates, path) : Infinity;
    return { ...item, detourKm: Math.round(detourKm * 10) / 10 };
  }).filter((item) => item.detourKm <= maximumKm)
    .sort((left, right) => left.detourKm - right.detourKm);
  return { ...result, items, count: items.length, nearRoute: true };
}

async function computePrivateTripRoute({
  admin,
  auth,
  data,
  providerRateLimitKey,
  fetchImpl,
  getAccessToken = getGoogleRoutesAccessToken,
}) {
  const tripId = cleanId(data?.tripId, 'tripId');
  const dayId = cleanId(data?.dayId, 'dayId');
  const db = admin.firestore();
  const tripRef = db.doc(`trips/${tripId}`);
  const [tripSnapshot, daySnapshot] = await Promise.all([
    tripRef.get(),
    tripRef.collection('days').doc(dayId).get(),
  ]);
  const trip = snapshotValue(tripSnapshot);
  assertPrivateTrip(trip, auth.uid);
  assertPlanner(daySnapshot.exists, 'not-found', 'Day does not exist.', 'DAY_NOT_FOUND');
  const day = daySnapshot.data();
  const stopsSnapshot = await daySnapshot.ref.collection('stops').orderBy('order').get();
  const unroutableStopIds = [];
  const points = stopsSnapshot.docs.flatMap((entry) => {
    const coordinates = entry.data()?.coordinates;
    if (!coordinates || !Number.isFinite(Number(coordinates.lat)) || !Number.isFinite(Number(coordinates.lng))) {
      unroutableStopIds.push(entry.id);
      return [];
    }
    return [{ stopId: entry.id, coordinates: { lat: Number(coordinates.lat), lng: Number(coordinates.lng) } }];
  });
  if (points.length < 2) {
    return {
      tripId,
      dayId,
      travelMode: day.travelMode,
      segments: [],
      totals: { distanceMeters: 0, durationSeconds: 0 },
      unroutableStopIds,
      routeRequired: false,
    };
  }
  const units = Math.ceil((points.length - 1) / 11);
  await consumeProviderBudget({
    admin, auth, action: 'routeComputation', units, key: providerRateLimitKey,
  });
  const accessToken = await getAccessToken();
  const computed = await computeRouteChunks({
    accessToken,
    billingProject: billingProjectId(),
    fetchImpl,
    points,
    travelMode: day.travelMode,
  });
  return {
    tripId,
    dayId,
    travelMode: day.travelMode,
    ...computed,
    unroutableStopIds,
    routeRequired: true,
  };
}

async function saveTrip() {
  throw new HttpsError('failed-precondition', 'Trip publishing has moved to private Trip Planning.', {
    reason: 'PRIVATE_TRIP_PLANNER_REQUIRED',
  });
}

module.exports = {
  DEFAULT_NEAR_ROUTE_KM,
  DEEP_LINK_BASE_URL,
  MAX_ACTIVE_TRIPS_PER_USER,
  RECEIPT_TTL_MS,
  REVOKED_SHARE_TTL_MS,
  SHARE_BASE_URL,
  SHARE_TOKEN_BYTES,
  applyPrivateTripOperations,
  assertTripAllocationAvailable,
  assertPrivateTrip,
  cleanShareToken,
  compactTripListItem,
  computePrivateTripRoute,
  copySharedTrip,
  createPrivateTrip,
  createTripShare,
  customStop,
  dayDocument,
  deletePrivateTrip,
  discoverTripRecommendations,
  distanceFromPathKm,
  getPrivateTrip,
  getSharedTrip,
  listMyTrips,
  loadTripGraph,
  operationReceiptId,
  prepareOperations,
  projectPointDistanceKm,
  recommendationStop,
  revokeTripShare,
  saveTrip,
  shareTokenHash,
  sharedTripContext,
  tripQuotaId,
  tripQuotaRef,
};
