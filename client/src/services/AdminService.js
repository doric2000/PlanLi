import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

const callables = new Map();
const call = async (name, payload = {}) => {
  if (!callables.has(name)) callables.set(name, httpsCallable(cloudFunctions, name));
  const response = await callables.get(name)(payload);
  return response.data;
};

export const getModerationDashboard = () => call('getModerationDashboard');
export const listModerationCases = (payload = {}) => call('listModerationCases', payload);
export const getModerationCase = (caseId) => call('getModerationCase', { caseId });
export const listHeldContent = () => call('listHeldContent');
export const moderateContent = (payload) => call('moderateContent', payload);
export const listAdminUsers = (payload = {}) => call('listAdminUsers', payload);
export const getAdminUser = (identifier) => call('getAdminUser', { identifier });
export const setUserSuspension = (identifier, suspended, reason) => call('setUserSuspension', { identifier, suspended, reason });
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
export const deactivateDestination = (countryId, cityId, reason) => call('deactivateDestination', { countryId, cityId, reason });
