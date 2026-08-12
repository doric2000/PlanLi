import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';
import { getPersonalizedRoutes, recordRouteOpen } from './PersonalizationService';

let saveRouteCallable;
let loadRouteDetailsCallable;

export const saveRoute = async (route, routeId = null, publishRequestId = null) => {
  saveRouteCallable ||= httpsCallable(cloudFunctions, 'saveRoute');
  const response = await saveRouteCallable({
    route,
    ...(routeId ? { routeId } : {}),
    ...(publishRequestId ? { publishRequestId } : {}),
  });
  return response.data;
};

export const loadRouteDetails = async (routeId) => {
  loadRouteDetailsCallable ||= httpsCallable(cloudFunctions, 'loadRouteDetails');
  const response = await loadRouteDetailsCallable({ routeId });
  return response.data?.route || null;
};

export const discoverRoutes = (payload = {}) => getPersonalizedRoutes(payload);

export { recordRouteOpen };

