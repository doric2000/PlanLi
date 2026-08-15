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
