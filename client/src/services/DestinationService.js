import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';

let destinationOverviewCallable = null;

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
