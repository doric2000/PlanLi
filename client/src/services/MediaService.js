import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';

let prepareMediaCallable;

const getPrepareMediaCallable = () => {
  if (!prepareMediaCallable) {
    prepareMediaCallable = httpsCallable(cloudFunctions, 'prepareMedia');
  }
  return prepareMediaCallable;
};

export const prepareMedia = async ({ stagingPath, kind }) => {
  const response = await getPrepareMediaCallable()({ stagingPath, kind });
  return response?.data || null;
};

