import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

let saveTripCallable;

export const saveTrip = async (trip, tripId = null) => {
  saveTripCallable ||= httpsCallable(cloudFunctions, 'saveTrip');
  const response = await saveTripCallable({
    ...(tripId ? { tripId } : {}),
    trip,
  });
  return response.data;
};
