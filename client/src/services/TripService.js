import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import uuid from 'react-native-uuid';

import { cloudFunctions } from '../config/firebase';
import { trackOperation } from '../features/operations/operationService';

const CACHE_PREFIX = 'planli:trip-planner:cache:';
const QUEUE_PREFIX = 'planli:trip-planner:queue:';
const QUEUE_QUARANTINE_PREFIX = 'planli:trip-planner:queue-quarantine:';
const QUEUED_OPERATION_TYPES = new Set([
  'set_title', 'add_day', 'update_day', 'delete_day', 'add_recommendation_stops',
  'add_custom_stop', 'update_custom_stop', 'delete_stop', 'move_stop', 'reorder_stops',
]);
const callables = new Map();

const callable = (name, timeout = 70_000) => {
  if (!callables.has(name)) {
    callables.set(name, httpsCallable(cloudFunctions, name, { timeout }));
  }
  return callables.get(name);
};

const call = async (name, data = {}, timeout) => (
  await callable(name, timeout)(data)
).data;

const operationId = (prefix = 'trip') => `${prefix}:${uuid.v4()}`;

const corruptQueueError = () => Object.assign(
  new Error('Stored trip operations could not be read safely.'),
  { code: 'trip/local-queue-corrupt' },
);

export const isCorruptTripQueueError = (error) => error?.code === 'trip/local-queue-corrupt';

const parseTripOperationQueue = (stored, tripId) => {
  const queue = stored ? JSON.parse(stored) : [];
  if (!Array.isArray(queue) || queue.some((entry) => (
    !entry || typeof entry !== 'object' || Array.isArray(entry)
    || typeof entry.id !== 'string' || !entry.id
    || entry.tripId !== tripId
    || !Number.isInteger(entry.expectedRevision) || entry.expectedRevision < 1
    || !Array.isArray(entry.operations) || !entry.operations.length
    || entry.operations.some((operation) => (
      !operation || typeof operation !== 'object' || Array.isArray(operation)
      || !QUEUED_OPERATION_TYPES.has(operation.type)
    ))
  ))) throw corruptQueueError();
  return queue;
};

export const tripErrorReason = (error) => (
  error?.details?.reason
  || error?.customData?.details?.reason
  || error?.cause?.details?.reason
  || ''
);

export const tripErrorMessage = (error, fallback = 'לא הצלחנו לעדכן את הטיול. נסו שוב.') => {
  const reason = tripErrorReason(error);
  if (reason === 'REVISION_CONFLICT') return 'הטיול השתנה במכשיר אחר. טענו את הגרסה העדכנית ונסו שוב.';
  if (reason === 'STOP_LIMIT_REACHED') return 'הגעתם למספר העצירות המרבי בטיול.';
  if (reason === 'DAY_LIMIT_REACHED') return 'אפשר לתכנן עד 14 ימים בכל טיול.';
  if (reason === 'TRIP_LIMIT_REACHED') return 'אפשר לשמור עד 50 טיולים פעילים. מחקו טיול ישן ונסו שוב.';
  if (reason === 'RECOMMENDATION_UNAVAILABLE') return 'אחת ההמלצות שבחרתם כבר אינה זמינה.';
  if (reason === 'RECOMMENDATION_LOCATION_UNAVAILABLE') return 'לאחת ההמלצות אין מיקום מתאים למסלול. הסירו אותה מהבחירה ונסו שוב.';
  if (reason === 'INVALID_STOP_ORDER') return 'סדר העצירות השתנה. טענו את הטיול מחדש ונסו שוב.';
  if (reason === 'ROUTES_API_NOT_AVAILABLE' || reason === 'ROUTES_UNAVAILABLE') {
    return 'המסלול החי אינו זמין כרגע. העצירות נשמרו ויוצגו בקו מקווקו.';
  }
  if (error?.code === 'functions/unavailable' || error?.code === 'functions/deadline-exceeded') {
    return 'אין חיבור יציב כרגע. השינויים נשמרו במכשיר ויסונכרנו בהמשך.';
  }
  return fallback;
};

export const isOfflineTripError = (error) => [
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
].includes(error?.code);

export const createPrivateTrip = (input = {}) => trackOperation(
  { kind: 'trip' },
  () => call('createPrivateTrip', input),
);

export const listMyTrips = (limit = 30) => call('listMyTrips', { limit });

export const getPrivateTrip = async (tripId, { cache = true } = {}) => {
  const trip = await call('getPrivateTrip', { tripId });
  if (cache) await cacheTrip(trip).catch(() => {});
  return trip;
};

export const applyPrivateTripOperations = async ({
  tripId,
  expectedRevision,
  operations,
  id = operationId('mutate'),
}) => call('applyPrivateTripOperations', {
  tripId,
  expectedRevision,
  operationId: id,
  operations,
});

export const deletePrivateTrip = (tripId) => trackOperation(
  { kind: 'trip', targetId: tripId },
  () => call('deletePrivateTrip', { tripId }, 300_000),
);

export const createTripShare = (tripId) => call('createTripShare', { tripId });
export const revokeTripShare = (tripId) => call('revokeTripShare', { tripId });
export const getSharedTrip = (token) => call('getSharedTrip', { token });
export const copySharedTrip = (token) => trackOperation(
  { kind: 'trip' },
  () => call('copySharedTrip', { token }),
);

export const discoverTripRecommendations = (input) => call('discoverTripRecommendations', input);
export const computePrivateTripRoute = (tripId, dayId) => call(
  'computePrivateTripRoute',
  { tripId, dayId },
);

export async function cacheTrip(trip) {
  if (!trip?.id) return;
  await AsyncStorage.setItem(`${CACHE_PREFIX}${trip.id}`, JSON.stringify(trip));
}

export async function loadCachedTrip(tripId) {
  const stored = await AsyncStorage.getItem(`${CACHE_PREFIX}${tripId}`);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${tripId}`);
    return null;
  }
}

export async function queueTripOperations({ tripId, expectedRevision, operations, id = operationId('offline') }) {
  const key = `${QUEUE_PREFIX}${tripId}`;
  const stored = await AsyncStorage.getItem(key);
  let queue = [];
  try {
    queue = parseTripOperationQueue(stored, tripId);
  } catch {
    throw corruptQueueError();
  }
  const existing = queue.find((entry) => entry.id === id);
  if (existing) return existing;
  const entry = { id, tripId, expectedRevision, operations, queuedAt: Date.now() };
  await AsyncStorage.setItem(key, JSON.stringify([...queue, entry]));
  return entry;
}

export async function flushTripOperationQueue(tripId) {
  const key = `${QUEUE_PREFIX}${tripId}`;
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return { applied: 0, remaining: 0 };
  let queue;
  try {
    queue = parseTripOperationQueue(stored, tripId);
  } catch {
    return { applied: 0, remaining: 1, corrupt: true };
  }
  let applied = 0;
  let revision = null;
  let conflict = false;
  const remaining = [];
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    try {
      const result = await applyPrivateTripOperations({
        tripId: entry.tripId,
        expectedRevision: revision ?? entry.expectedRevision,
        operations: entry.operations,
        id: entry.id,
      });
      revision = result.revision;
      applied += 1;
    } catch (error) {
      let finalError = error;
      if (tripErrorReason(error) === 'REVISION_CONFLICT') {
        try {
          const latest = await getPrivateTrip(tripId, { cache: false });
          const result = await applyPrivateTripOperations({
            tripId: entry.tripId,
            expectedRevision: latest.revision,
            operations: entry.operations,
            id: entry.id,
          });
          revision = result.revision;
          applied += 1;
          continue;
        } catch (retryError) {
          finalError = retryError;
          conflict = !isOfflineTripError(retryError);
        }
      }
      if (!isOfflineTripError(finalError)) conflict = true;
      remaining.push(...queue.slice(index));
      break;
    }
  }
  if (remaining.length) await AsyncStorage.setItem(key, JSON.stringify(remaining));
  else await AsyncStorage.removeItem(key);
  return { applied, remaining: remaining.length, ...(conflict ? { conflict: true } : {}) };
}

export async function hasQueuedTripOperations(tripId) {
  const stored = await AsyncStorage.getItem(`${QUEUE_PREFIX}${tripId}`);
  if (!stored) return false;
  try {
    const entries = JSON.parse(stored);
    return !Array.isArray(entries) || entries.length > 0;
  } catch { return true; }
}

export async function quarantineTripOperationQueue(tripId) {
  const queueKey = `${QUEUE_PREFIX}${tripId}`;
  const stored = await AsyncStorage.getItem(queueKey);
  if (!stored) return { quarantined: false };
  const backup = {
    version: 1,
    tripId,
    quarantinedAt: Date.now(),
    raw: stored,
  };
  await AsyncStorage.setItem(`${QUEUE_QUARANTINE_PREFIX}${tripId}`, JSON.stringify(backup));
  await AsyncStorage.removeItem(`${CACHE_PREFIX}${tripId}`);
  await AsyncStorage.removeItem(queueKey);
  return { quarantined: true };
}

export { operationId };
