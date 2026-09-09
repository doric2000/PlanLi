import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../../../config/firebase';

let setDiscoveryRegionCallable;

export async function syncSelectedRegion(regionId, mode = 'region') {
  setDiscoveryRegionCallable ||= httpsCallable(cloudFunctions, 'setDiscoveryRegion');
  const response = await setDiscoveryRegionCallable(mode === 'global' ? { mode: 'global' } : { regionId });
  return response?.data || null;
}
