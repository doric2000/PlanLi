import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';

let destinationOverviewCallable = null;
let destinationSearchCallable = null;

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

export async function searchDestinations(payload = {}) {
  if (!destinationSearchCallable) {
    destinationSearchCallable = httpsCallable(cloudFunctions, 'searchDestinations');
  }
  const response = await destinationSearchCallable(payload);
  return response?.data || { items: [], nextCursor: null };
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
