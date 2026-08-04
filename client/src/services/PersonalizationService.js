import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

const callables = new Map();
const recentOpenAttempts = new Map();

const call = async (name, payload = {}) => {
  if (!callables.has(name)) callables.set(name, httpsCallable(cloudFunctions, name));
  const response = await callables.get(name)(payload);
  return response?.data || null;
};

export const getPersonalizedRecommendations = (payload = {}) =>
  call('getPersonalizedRecommendations', payload);

export const getPersonalizedRoutes = (payload = {}) =>
  call('getPersonalizedRoutes', payload);

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
