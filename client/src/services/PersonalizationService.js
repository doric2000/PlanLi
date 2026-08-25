import { httpsCallable } from 'firebase/functions';
import { auth, cloudFunctions } from '../config/firebase';
import { createRequestCoordinator } from '../utils/requestCoordinator';
import { loadGuestNoyaProfile } from '../features/profile/services/NoyaOnboardingStorage';
import {
  clearGuestPersonalizationAfterMerge,
  loadGuestBehaviorContext,
  loadPendingGuestPersonalizationMerge,
  recordGuestPersonalizationEvent,
  resetGuestPersonalization,
} from '../features/profile/services/GuestPersonalizationStorage';

const callables = new Map();
const recentViewAttempts = new Map();
const discoveryVersions = new Map();

export const DISCOVERY_CACHE_TTL_MS = 30 * 1000;
export const DISCOVERY_STALE_TTL_MS = 5 * 60 * 1000;
export const DISCOVERY_ERROR_RETRY_MS = 15 * 1000;
const MAX_DISCOVERY_CACHE_ENTRIES = 40;
const discoveryCoordinator = createRequestCoordinator({
  freshMs: DISCOVERY_CACHE_TTL_MS,
  staleMs: DISCOVERY_STALE_TTL_MS,
  retryMs: DISCOVERY_ERROR_RETRY_MS,
  maxEntries: MAX_DISCOVERY_CACHE_ENTRIES,
});

const DISCOVERY_CALLABLES = Object.freeze({
  recommendations: 'getPersonalizedRecommendations',
  routes: 'getPersonalizedRoutes',
  map: 'getMapRecommendations',
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function discoveryCacheKey(name, payload, principalUid = auth.currentUser?.uid || null) {
  const principal = principalUid || 'guest';
  const normalizedPayload = name === DISCOVERY_CALLABLES.map && payload?.viewport
    ? {
      ...payload,
      viewport: Object.fromEntries(Object.entries(payload.viewport).map(([key, value]) => [
        key,
        Number.isFinite(Number(value)) ? Number(Number(value).toFixed(key === 'zoom' ? 1 : 3)) : value,
      ])),
    }
    : payload;
  return `${principal}:${name}:${discoveryVersion(name)}:${JSON.stringify(canonicalize(normalizedPayload || {}))}`;
}

function discoveryVersion(name) {
  return Number(discoveryVersions.get(name) || 0);
}

const call = async (name, payload = {}) => {
  if (!callables.has(name)) callables.set(name, httpsCallable(cloudFunctions, name));
  const response = await callables.get(name)(payload);
  return response?.data || null;
};

function createPrincipalChangedError() {
  const error = new Error('Authentication identity changed during discovery.');
  error.code = 'auth/identity-changed';
  return error;
}

function requestDiscovery(name, payload = {}, retryIdentityChange = true) {
  const principalUid = auth.currentUser?.uid || null;
  const key = discoveryCacheKey(name, payload, principalUid);
  const assertPrincipalUnchanged = () => {
    if ((auth.currentUser?.uid || null) !== principalUid) throw createPrincipalChangedError();
  };
  const coordinated = discoveryCoordinator.request(key, async () => {
    const supportsGuestPreferences = [
      DISCOVERY_CALLABLES.recommendations,
      DISCOVERY_CALLABLES.routes,
    ].includes(name);
    const storedGuestProfile = !principalUid && supportsGuestPreferences
      ? await loadGuestNoyaProfile()
      : null;
    const guestBehaviorContext = !principalUid && supportsGuestPreferences
      ? await loadGuestBehaviorContext()
      : null;
    assertPrincipalUnchanged();
    const guestPreferenceContext = storedGuestProfile ? {
      interests: storedGuestProfile.interests,
      budget: storedGuestProfile.budget,
      travelParties: storedGuestProfile.travelParties,
      needs: storedGuestProfile.needs,
      onboardingVersion: storedGuestProfile.onboardingVersion,
    } : null;
    const result = await call(name, {
      ...payload,
      ...(guestPreferenceContext ? { guestPreferenceContext } : {}),
      ...(guestBehaviorContext ? { guestBehaviorContext } : {}),
    });
    assertPrincipalUnchanged();
    return result;
  });
  const promise = coordinated.promise.catch((error) => {
    if (error?.code !== 'auth/identity-changed') throw error;
    discoveryCoordinator.invalidate(key);
    if (!retryIdentityChange) throw error;
    return requestDiscovery(name, payload, false).promise;
  });
  return { ...coordinated, promise };
}

export const requestPersonalizedRecommendations = (payload = {}) =>
  requestDiscovery(DISCOVERY_CALLABLES.recommendations, payload);

export const getPersonalizedRecommendations = (payload = {}) =>
  requestPersonalizedRecommendations(payload).promise;

export const requestPersonalizedRoutes = (payload = {}) =>
  requestDiscovery(DISCOVERY_CALLABLES.routes, payload);

export const getPersonalizedRoutes = (payload = {}) =>
  requestPersonalizedRoutes(payload).promise;

export const requestPersonalizedMapRecommendations = (payload = {}) =>
  requestDiscovery(DISCOVERY_CALLABLES.map, payload);

export const getPersonalizedMapRecommendations = (payload = {}) =>
  requestPersonalizedMapRecommendations(payload).promise;

export function clearPersonalizationDiscoveryCache(kind) {
  const callableName = kind ? DISCOVERY_CALLABLES[kind] : null;
  const affectedCallables = kind === 'recommendations'
    ? [DISCOVERY_CALLABLES.recommendations, DISCOVERY_CALLABLES.map]
    : callableName
      ? [callableName]
    : Object.values(DISCOVERY_CALLABLES);
  affectedCallables.forEach((name) => {
    discoveryVersions.set(name, discoveryVersion(name) + 1);
  });
  discoveryCoordinator.invalidate((key) => (
    !kind || affectedCallables.some((name) => key.includes(`:${name}:`))
  ));
}

async function recordMeaningfulView(type, item) {
  const id = item?.id;
  if (!id) return { recorded: false };
  const key = `${type}:${id}`;
  const now = Date.now();
  if (now - Number(recentViewAttempts.get(key) || 0) < 5_000) {
    return Promise.resolve({ recorded: false });
  }
  recentViewAttempts.set(key, now);
  const target = { type, id };
  const result = auth.currentUser?.uid
    ? await call('recordDiscoverySignal', { action: 'meaningful_view', target })
    : await recordGuestPersonalizationEvent({ action: 'meaningful_view', target, item, nowMs: now });
  if (result?.recorded) clearPersonalizationDiscoveryCache(type === 'route' ? 'routes' : 'recommendations');
  return result;
}

export const recordRecommendationView = (item) => recordMeaningfulView('recommendation', item);
export const recordRouteView = (item) => recordMeaningfulView('route', item);

// Kept for older consumers during the V2 rollout. New screens wait eight seconds
// and pass the full item to the meaningful-view functions above.
export const recordRecommendationOpen = (recommendationId) =>
  recordRecommendationView({ id: recommendationId });

export const recordRouteOpen = (routeId) =>
  recordRouteView({ id: routeId });

export async function setPersonalizationFeedback({ target, item, value, requestId }) {
  const action = value === 'undo' ? 'undo_less' : 'less';
  const result = auth.currentUser?.uid
    ? await call('setPersonalizationFeedback', { target, value, requestId })
    : await recordGuestPersonalizationEvent({ action, target, item });
  clearPersonalizationDiscoveryCache(target.type === 'route' ? 'routes' : 'recommendations');
  return result;
}

export async function mergePendingGuestPersonalization() {
  const uid = auth.currentUser?.uid;
  if (!uid) return { merged: 0, alreadyMerged: false };
  let merged = 0;
  let alreadyMerged = false;
  let completedBatches = 0;
  for (let index = 0; index < 3; index += 1) {
    if (auth.currentUser?.uid !== uid) break;
    const pending = await loadPendingGuestPersonalizationMerge();
    if (!pending) break;
    if (auth.currentUser?.uid !== uid) break;
    const result = await call('mergeGuestPersonalization', pending);
    const cleared = await clearGuestPersonalizationAfterMerge(pending.mergeId);
    if (!cleared) break;
    merged += Number(result?.merged || 0);
    alreadyMerged = alreadyMerged || result?.alreadyMerged === true;
    completedBatches += 1;
  }
  if (completedBatches) clearPersonalizationDiscoveryCache();
  return { merged, alreadyMerged };
}

export async function setBehavioralPersonalizationEnabled(enabled) {
  const result = await call('setPersonalizationBehavior', { enabled });
  clearPersonalizationDiscoveryCache();
  return result;
}

export async function resetPersonalizationActivity() {
  const result = auth.currentUser?.uid
    ? await call('resetPersonalizationActivity')
    : { reset: true };
  await resetGuestPersonalization();
  clearPersonalizationDiscoveryCache();
  return result;
}
