import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';
import { compactDestinationText } from '../utils/destinationSearch';

let destinationOverviewCallable = null;
let destinationSearchCallable = null;
const DESTINATION_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_DESTINATION_SEARCH_CACHE_ENTRIES = 50;
const destinationSearchCache = new Map();

function destinationSearchCacheKey(payload) {
  const query = compactDestinationText(payload?.query);
  if (query.length < 2 || payload?.cursor) return '';
  return JSON.stringify({
    query,
    sort: payload?.sort || 'popular',
    limit: payload?.limit || 20,
    countryId: String(payload?.countryId || '').trim(),
  });
}

function trimDestinationSearchCache() {
  while (destinationSearchCache.size > MAX_DESTINATION_SEARCH_CACHE_ENTRIES) {
    destinationSearchCache.delete(destinationSearchCache.keys().next().value);
  }
}

export async function getDestinationOverview(payload) {
  if (!destinationOverviewCallable) {
    destinationOverviewCallable = httpsCallable(
      cloudFunctions,
      'getDestinationOverview'
    );
  }
  const response = await destinationOverviewCallable(payload);
  return response?.data || null;
}

export async function searchDestinations(payload = {}, { forceRefresh = false } = {}) {
  if (!destinationSearchCallable) {
    destinationSearchCallable = httpsCallable(cloudFunctions, 'searchDestinations');
  }
  const cacheKey = destinationSearchCacheKey(payload);
  const now = Date.now();
  const cached = cacheKey ? destinationSearchCache.get(cacheKey) : null;
  if (!forceRefresh && cached && cached.expiresAt > now) return cached.promise;
  if (cacheKey) destinationSearchCache.delete(cacheKey);

  const promise = destinationSearchCallable(payload)
    .then((response) => response?.data || { items: [], nextCursor: null })
    .catch((error) => {
      if (cacheKey) destinationSearchCache.delete(cacheKey);
      throw error;
    });
  if (cacheKey) {
    destinationSearchCache.set(cacheKey, {
      expiresAt: now + DESTINATION_SEARCH_CACHE_TTL_MS,
      promise,
    });
    trimDestinationSearchCache();
  }
  return promise;
}

export function clearDestinationSearchCache() {
  destinationSearchCache.clear();
}

export function destinationCatalogItemToCity(item, placeholderColor) {
  const data = item && typeof item === 'object' ? item : {};
  const names = data.names || {};
  const countryNames = data.countryNames || {};
  return {
    id: data.cityId || '',
    cityId: data.cityId || '',
    countryId: data.countryId || '',
    name: names.he || names.en || data.cityId || '',
    names,
    identity: { names },
    countryNames,
    countryName: countryNames.he || countryNames.en || data.countryId || '',
    destinationImage: data.destinationImage || null,
    stats: { recommendationCount: Math.max(0, Number(data.recommendationCount || 0)) },
    status: 'active',
    ...(placeholderColor ? { placeholderColor } : {}),
  };
}
