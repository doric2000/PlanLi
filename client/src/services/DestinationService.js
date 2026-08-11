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
