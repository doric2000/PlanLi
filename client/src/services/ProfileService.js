import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

let updateProfileCallable;
let registerUserCallable;

export const saveProfile = async (fields) => {
  updateProfileCallable ||= httpsCallable(cloudFunctions, 'updateProfile');
  const response = await updateProfileCallable(fields);
  return response.data;
};

export const registerUserDocument = async (fields = {}) => {
  registerUserCallable ||= httpsCallable(cloudFunctions, 'registerUser');
  const response = await registerUserCallable(fields);
  return response.data;
};
