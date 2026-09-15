import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import uuid from 'react-native-uuid';

import { cloudFunctions } from '../config/firebase';
import { trackOperation } from '../features/operations/operationService';

const CACHE_PREFIX = 'planli:trip-planner:cache:';
const QUEUE_PREFIX = 'planli:trip-planner:queue:';
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
  if (cache) await cacheTrip(trip);
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
    queue = stored ? JSON.parse(stored) : [];
  } catch {
    queue = [];
  }
  const entry = { id, tripId, expectedRevision, operations, queuedAt: Date.now() };
  await AsyncStorage.setItem(key, JSON.stringify([...queue, entry].slice(-50)));
  return entry;
}

export async function flushTripOperationQueue(tripId) {
  const key = `${QUEUE_PREFIX}${tripId}`;
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return { applied: 0, remaining: 0 };
  let queue;
  try {
    queue = JSON.parse(stored);
  } catch {
    await AsyncStorage.removeItem(key);
    return { applied: 0, remaining: 0 };
  }
  let applied = 0;
  const remaining = [];
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    try {
      await applyPrivateTripOperations({
        tripId: entry.tripId,
        expectedRevision: entry.expectedRevision,
        operations: entry.operations,
        id: entry.id,
      });
      applied += 1;
    } catch (error) {
      remaining.push(...queue.slice(index));
      break;
    }
  }
  if (remaining.length) await AsyncStorage.setItem(key, JSON.stringify(remaining));
  else await AsyncStorage.removeItem(key);
  return { applied, remaining: remaining.length };
}

export { operationId };
