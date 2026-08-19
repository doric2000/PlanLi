import { httpsCallable } from 'firebase/functions';
import { auth, cloudFunctions } from '../config/firebase';

const callables = new Map();
const recentOpenAttempts = new Map();
const discoveryCache = new Map();
const discoveryRequests = new Map();
const discoveryFailures = new Map();
const discoveryVersions = new Map();

export const DISCOVERY_CACHE_TTL_MS = 30 * 1000;
export const DISCOVERY_STALE_TTL_MS = 5 * 60 * 1000;
export const DISCOVERY_ERROR_RETRY_MS = 15 * 1000;
const MAX_DISCOVERY_CACHE_ENTRIES = 40;

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

function discoveryCacheKey(name, payload) {
  const principal = auth.currentUser?.uid || 'guest';
  const normalizedPayload = name === DISCOVERY_CALLABLES.map && payload?.viewport
    ? {
      ...payload,
      viewport: Object.fromEntries(Object.entries(payload.viewport).map(([key, value]) => [
        key,
        Number.isFinite(Number(value)) ? Number(Number(value).toFixed(key === 'zoom' ? 1 : 3)) : value,
      ])),
    }
    : payload;
  return `${principal}:${name}:${JSON.stringify(canonicalize(normalizedPayload || {}))}`;
}

function trimDiscoveryCache() {
  while (discoveryCache.size > MAX_DISCOVERY_CACHE_ENTRIES) {
    discoveryCache.delete(discoveryCache.keys().next().value);
  }
}

function trimDiscoveryFailures() {
  while (discoveryFailures.size > MAX_DISCOVERY_CACHE_ENTRIES) {
    discoveryFailures.delete(discoveryFailures.keys().next().value);
  }
}

function discoveryVersion(name) {
  return Number(discoveryVersions.get(name) || 0);
}

const call = async (name, payload = {}) => {
  if (!callables.has(name)) callables.set(name, httpsCallable(cloudFunctions, name));
  const response = await callables.get(name)(payload);
  return response?.data || null;
};

async function callDiscovery(name, payload = {}, { forceRefresh = false } = {}) {
  const key = discoveryCacheKey(name, payload);
  const now = Date.now();
  const cached = discoveryCache.get(key);
  if (!forceRefresh && cached?.freshUntil > now) return cached.value;
  const recentFailure = discoveryFailures.get(key);
  if (!forceRefresh && recentFailure?.retryAfter > now) {
    if (cached?.staleUntil > now) return cached.value;
    throw recentFailure.error;
  }
  let request = discoveryRequests.get(key);
  if (!request) {
    const version = discoveryVersion(name);
    request = call(name, payload)
      .then((value) => {
        const resolvedAt = Date.now();
        if (discoveryVersion(name) === version) {
          discoveryFailures.delete(key);
          discoveryCache.delete(key);
          discoveryCache.set(key, {
            value,
            freshUntil: resolvedAt + DISCOVERY_CACHE_TTL_MS,
            staleUntil: resolvedAt + DISCOVERY_STALE_TTL_MS,
          });
          trimDiscoveryCache();
        }
        return value;
      })
      .catch((error) => {
        if (discoveryVersion(name) === version) {
          discoveryFailures.set(key, {
            error,
            retryAfter: Date.now() + DISCOVERY_ERROR_RETRY_MS,
          });
          trimDiscoveryFailures();
        }
        throw error;
      })
      .finally(() => {
        if (discoveryRequests.get(key) === request) discoveryRequests.delete(key);
      });
    discoveryRequests.set(key, request);
  }
  return request.catch((error) => {
    if (!forceRefresh && cached?.staleUntil > Date.now()) return cached.value;
    throw error;
  });
}

export const getPersonalizedRecommendations = (payload = {}, options = {}) =>
  callDiscovery(DISCOVERY_CALLABLES.recommendations, payload, options);

export const getPersonalizedRoutes = (payload = {}, options = {}) =>
  callDiscovery(DISCOVERY_CALLABLES.routes, payload, options);

export const getPersonalizedMapRecommendations = (payload = {}, options = {}) =>
  callDiscovery(DISCOVERY_CALLABLES.map, payload, options);

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
  for (const key of discoveryCache.keys()) {
    if (!kind || affectedCallables.some((name) => key.includes(`:${name}:`))) discoveryCache.delete(key);
  }
  for (const key of discoveryFailures.keys()) {
    if (!kind || affectedCallables.some((name) => key.includes(`:${name}:`))) discoveryFailures.delete(key);
  }
  for (const key of discoveryRequests.keys()) {
    if (!kind || affectedCallables.some((name) => key.includes(`:${name}:`))) discoveryRequests.delete(key);
  }
}

export const recordRecommendationOpen = (recommendationId) => {
  const now = Date.now();
  if (now - Number(recentOpenAttempts.get(recommendationId) || 0) < 5_000) {
    return Promise.resolve({ recorded: false });
  }
  recentOpenAttempts.set(recommendationId, now);
  return call('recordDiscoverySignal', {
    action: 'open',
    target: { type: 'recommendation', id: recommendationId },
  });
};

export const recordRouteOpen = (routeId) => {
  const key = `route:${routeId}`;
  const now = Date.now();
  if (now - Number(recentOpenAttempts.get(key) || 0) < 5_000) return Promise.resolve({ recorded: false });
  recentOpenAttempts.set(key, now);
  return call('recordDiscoverySignal', {
    action: 'open',
    target: { type: 'route', id: routeId },
  });
};

export const resetPersonalizationActivity = () =>
  call('resetPersonalizationActivity');
