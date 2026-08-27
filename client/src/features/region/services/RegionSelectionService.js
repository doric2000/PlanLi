import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../../../config/firebase';

let setDiscoveryRegionCallable;

export async function syncSelectedRegion(regionId) {
  setDiscoveryRegionCallable ||= httpsCallable(cloudFunctions, 'setDiscoveryRegion');
  const response = await setDiscoveryRegionCallable({ regionId });
  return response?.data || null;
}
