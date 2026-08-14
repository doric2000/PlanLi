import { authStateForReason } from '../constants/authPolicy';

export function getCallableReason(error) {
  return error?.details?.reason || error?.customData?.details?.reason || null;
}

export function getRequiredAuthState(error) {
  return authStateForReason(getCallableReason(error));
}
