import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

import { trackOperation } from '../features/operations/operationService';

let saveTripCallable;

export const saveTrip = (trip, tripId = null) => trackOperation({ kind: 'trip', targetId: tripId }, async () => {
  saveTripCallable ||= httpsCallable(cloudFunctions, 'saveTrip');
  const response = await saveTripCallable({
    ...(tripId ? { tripId } : {}),
    trip,
  });
  return response.data;
});
