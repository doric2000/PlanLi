import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';
import {
  clearPersonalizationDiscoveryCache,
  getPersonalizedRoutes,
  recordRouteOpen,
} from './PersonalizationService';

let saveRouteCallable;
let loadRouteDetailsCallable;

export const saveRoute = async (route, routeId = null, publishRequestId = null) => {
  saveRouteCallable ||= httpsCallable(cloudFunctions, 'saveRoute');
  const response = await saveRouteCallable({
    route,
    ...(routeId ? { routeId } : {}),
    ...(publishRequestId ? { publishRequestId } : {}),
  });
  clearPersonalizationDiscoveryCache('routes');
  return response.data;
};

export const loadRouteDetails = async (routeId) => {
  loadRouteDetailsCallable ||= httpsCallable(cloudFunctions, 'loadRouteDetails');
  const response = await loadRouteDetailsCallable({ routeId });
  return response.data?.route || null;
};

export const discoverRoutes = (payload = {}, options = {}) => getPersonalizedRoutes(payload, options);

export const clearRouteDiscoveryCache = () => clearPersonalizationDiscoveryCache('routes');

export { recordRouteOpen };

