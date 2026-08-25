import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';
import {
  clearPersonalizationDiscoveryCache,
  getPersonalizedRoutes,
  requestPersonalizedRoutes,
  recordRouteOpen,
  recordRouteView,
} from './PersonalizationService';

let saveRouteCallable;
let loadRouteDetailsCallable;
let getCurrentRouteDraftCallable;
let saveRouteDraftCallable;
let discardRouteDraftCallable;
let publishRouteDraftCallable;

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

export const getCurrentRouteDraft = async () => {
  getCurrentRouteDraftCallable ||= httpsCallable(cloudFunctions, 'getCurrentRouteDraft');
  const response = await getCurrentRouteDraftCallable({});
  return response.data?.draft || null;
};

export const saveRouteDraft = async ({
  draftId = null, sourceRouteId = null, expectedVersion = null, saveRequestId = null, draft,
}) => {
  saveRouteDraftCallable ||= httpsCallable(cloudFunctions, 'saveRouteDraft');
  const response = await saveRouteDraftCallable({
    draft,
    ...(draftId ? { draftId } : {}),
    ...(sourceRouteId ? { sourceRouteId } : {}),
    ...(expectedVersion != null ? { expectedVersion } : {}),
    ...(saveRequestId ? { saveRequestId } : {}),
  });
  return response.data;
};

export const discardRouteDraft = async (draftId) => {
  discardRouteDraftCallable ||= httpsCallable(cloudFunctions, 'discardRouteDraft');
  const response = await discardRouteDraftCallable({ draftId });
  return response.data;
};

export const publishRouteDraft = async (draftId, expectedVersion) => {
  publishRouteDraftCallable ||= httpsCallable(cloudFunctions, 'publishRouteDraft');
  const response = await publishRouteDraftCallable({ draftId, expectedVersion });
  clearPersonalizationDiscoveryCache('routes');
  return response.data;
};

export const discoverRoutes = (payload = {}, options = {}) => getPersonalizedRoutes(payload, options);

export const requestRoutes = (payload = {}) => requestPersonalizedRoutes(payload);

export const clearRouteDiscoveryCache = () => clearPersonalizationDiscoveryCache('routes');

export { recordRouteOpen, recordRouteView };

