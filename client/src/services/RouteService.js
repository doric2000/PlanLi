import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';
import {
  clearPersonalizationDiscoveryCache,
  getPersonalizedRoutes,
  requestPersonalizedRoutes,
  recordRouteOpen,
} from './PersonalizationService';

let saveRouteCallable;
let loadRouteDetailsCallable;

export const saveRoute = async (route, routeId = null, publishRequestId = null) => {
  saveRouteCallable ||= httpsCallable(cloudFunctions, 'saveRoute');
  const incidentId = (route?.days || []).flatMap((day) => day?.stops || [])
    .map((stop) => stop?.place?.incidentId)
    .find(Boolean);
  const response = await saveRouteCallable({
    route,
    ...(incidentId ? { incidentId } : {}),
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

export const requestRoutes = (payload = {}) => requestPersonalizedRoutes(payload);

export const clearRouteDiscoveryCache = () => clearPersonalizationDiscoveryCache('routes');

export { recordRouteOpen };

