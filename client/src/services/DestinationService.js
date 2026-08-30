import { compactDestinationText } from '../utils/destinationSearch';
import { createRequestCoordinator } from '../utils/requestCoordinator';
import { callPublicCallable } from './PublicCallableService';

const DESTINATION_SEARCH_FRESH_MS = 30 * 1000;
const DESTINATION_SEARCH_STALE_MS = 5 * 60 * 1000;
const DESTINATION_SEARCH_RETRY_MS = 15 * 1000;
const MAX_DESTINATION_SEARCH_CACHE_ENTRIES = 50;
const destinationSearchCoordinator = createRequestCoordinator({
  freshMs: DESTINATION_SEARCH_FRESH_MS,
  staleMs: DESTINATION_SEARCH_STALE_MS,
  retryMs: DESTINATION_SEARCH_RETRY_MS,
  maxEntries: MAX_DESTINATION_SEARCH_CACHE_ENTRIES,
});

function destinationSearchCacheKey(payload) {
  const query = compactDestinationText(payload?.query);
  if ((query.length > 0 && query.length < 2) || payload?.cursor) return '';
  return JSON.stringify({
    query,
    sort: payload?.sort || 'popular',
    limit: payload?.limit || 20,
    countryId: String(payload?.countryId || '').trim(),
    regionId: String(payload?.regionId || '').trim(),
  });
}

export async function getDestinationOverview(payload) {
  return callPublicCallable('getDestinationOverview', payload);
}

export function requestDestinations(payload = {}) {
  const trimmedQuery = String(payload?.query || '').trim();
  const requestPayload = payload?.query === undefined
    ? payload
    : { ...payload, query: compactDestinationText(trimmedQuery) ? trimmedQuery : '' };
  const cacheKey = destinationSearchCacheKey(requestPayload);
  const loader = () => callPublicCallable('searchDestinations', requestPayload)
    .then((response) => response || { items: [], nextCursor: null });
  if (!cacheKey) return { requested: true, source: 'network', promise: loader() };
  return destinationSearchCoordinator.request(cacheKey, loader);
}

export function searchDestinations(payload = {}) {
  return requestDestinations(payload).promise;
}

export function clearDestinationSearchCache() {
  destinationSearchCoordinator.clear();
}

export function destinationCatalogItemToCity(item, placeholderColor) {
  const data = item && typeof item === 'object' ? item : {};
  const names = data.names || {};
  const countryNames = data.countryNames || {};
  return {
    id: data.cityId || '',
    cityId: data.cityId || '',
    countryId: data.countryId || '',
    discoveryRegionId: data.discoveryRegionId || null,
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
