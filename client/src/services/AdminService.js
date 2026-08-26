import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

const callables = new Map();
export const ADMIN_CALLABLE_TIMEOUTS = Object.freeze({
  moderateContent: 320000,
  resolveModerationCase: 320000,
  bulkUpdateModerationCases: 320000,
  updateAdminAttachedPlace: 200000,
  setUserSuspension: 320000,
  deleteUserAsAdmin: 560000,
  listDestinationReviews: 140000,
  recheckDestination: 200000,
  getDestinationImageCandidates: 200000,
  selectDestinationImageCandidate: 140000,
  setDestinationUploadedImage: 320000,
  getAirportCandidates: 140000,
  setDestinationAirport: 140000,
  setDestinationHebrewName: 320000,
  updateDestinationPolicy: 320000,
  previewDestinationReassignment: 320000,
  startDestinationReassignment: 320000,
  deactivateDestination: 320000,
});
const call = async (name, payload = {}) => {
  if (!callables.has(name)) {
    callables.set(name, httpsCallable(cloudFunctions, name, {
      timeout: ADMIN_CALLABLE_TIMEOUTS[name] || 70000,
    }));
  }
  const response = await callables.get(name)(payload);
  return response.data;
};

export const getModerationDashboard = () => call('getModerationDashboard');
export const listModerationCases = (payload = {}) => call('listModerationCases', payload);
export const getModerationCase = (caseId) => call('getModerationCase', { caseId });
export const updateModerationCase = (payload) => call('updateModerationCase', payload);
export const resolveModerationCase = (payload) => call('resolveModerationCase', payload);
export const bulkUpdateModerationCases = (payload) => call('bulkUpdateModerationCases', payload);
export const searchAdminResources = (payload = {}) => call('searchAdminResources', payload);
export const getAdminResource = (target) => call('getAdminResource', { target });
export const listAdminSavedViews = () => call('listAdminSavedViews');
export const saveAdminSavedView = (payload) => call('saveAdminSavedView', payload);
export const deleteAdminSavedView = (id) => call('deleteAdminSavedView', { id });
export const getModerationPolicy = () => call('getModerationPolicy');
export const updateAdminAttachedPlace = (payload) => call('updateAdminAttachedPlace', payload);
export const listHeldContent = () => call('listHeldContent');
export const moderateContent = (payload) => call('moderateContent', payload);
export const listAdminUsers = (payload = {}) => call('listAdminUsers', payload);
export const getAdminUser = (identifier) => call('getAdminUser', { identifier });
export const setUserSuspension = (identifier, suspended, reason, durationHours = undefined) => call('setUserSuspension', {
  identifier,
  suspended,
  reason,
  ...(suspended && durationHours !== undefined ? { durationHours } : {}),
});
export const setUserEmailVerified = (identifier, verified, reason) => call('setUserEmailVerified', { identifier, verified, reason });
export const setUserAdmin = (identifier, admin, reason) => call('setUserAdmin', { identifier, admin, reason });
export const deleteUserAsAdmin = (identifier, reason) => call('deleteUserAsAdmin', { identifier, reason });
export const listModerationAudit = (payload = {}) => call('listModerationAudit', payload);
export const listDestinationReviews = (payload = {}) => call('listDestinationReviews', payload);
export const getDestinationReview = (countryId, cityId) => call('getDestinationReview', { countryId, cityId });
export const recheckDestination = (countryId, cityId) => call('recheckDestination', { countryId, cityId });
export const approveDestination = (countryId, cityId, reason) => call('approveDestination', { countryId, cityId, reason });
export const getDestinationImageCandidates = (countryId, cityId) => call('getDestinationImageCandidates', { countryId, cityId });
export const selectDestinationImageCandidate = (countryId, cityId, candidateId, reason) => call('selectDestinationImageCandidate', { countryId, cityId, candidateId, reason });
export const setDestinationUploadedImage = (countryId, cityId, asset, reason, alt = '') => call('setDestinationUploadedImage', { countryId, cityId, asset, reason, alt });
export const getAirportCandidates = (countryId, cityId) => call('getAirportCandidates', { countryId, cityId });
export const setDestinationAirport = (countryId, cityId, iataCode, reason) => call('setDestinationAirport', { countryId, cityId, iataCode, reason });
export const setDestinationHebrewName = (countryId, cityId, nameHe, reason) => call('setDestinationHebrewName', { countryId, cityId, nameHe, reason });
export const getDestinationRenameJob = (jobId) => call('getDestinationRenameJob', { jobId });
export const updateDestinationPolicy = (countryId, cityId, policy, reason) => call('updateDestinationPolicy', { countryId, cityId, ...policy, reason });
export const previewDestinationReassignment = (source, target) => call('previewDestinationReassignment', { source, target });
export const startDestinationReassignment = (source, target, expectedImpactHash, reason) => call('startDestinationReassignment', { source, target, expectedImpactHash, reason });
export const getDestinationReassignmentJob = (jobId) => call('getDestinationReassignmentJob', { jobId });
export const deactivateDestination = (countryId, cityId, reason) => call('deactivateDestination', { countryId, cityId, reason });
