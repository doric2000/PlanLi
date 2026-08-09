import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

let callable;

export async function getMapRecommendations(payload) {
  if (!callable) callable = httpsCallable(cloudFunctions, 'getMapRecommendations');
  const response = await callable(payload);
  return response?.data || { items: [], count: 0, truncated: false, zoomInRequired: false };
}
