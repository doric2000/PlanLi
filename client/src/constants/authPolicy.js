export const AUTH_STATES = Object.freeze({
  LOADING: 'loading',
  GUEST: 'guest',
  EMAIL_VERIFICATION_REQUIRED: 'emailVerificationRequired',
  ACCOUNT_SETUP_REQUIRED: 'accountSetupRequired',
  PREFERENCES_REQUIRED: 'preferencesRequired',
  READY: 'ready',
});

export const CAPABILITIES = Object.freeze({
  PUBLIC: 'public',
  SIGNED_IN: 'signedIn',
  ACTIVE: 'active',
  ACCOUNT_MANAGEMENT: 'accountManagement',
});

export const PROFILE_DETAILS_VERSION = 1;
export const TERMS_VERSION = '2026-08-14-draft';
export const PRIVACY_VERSION = '2026-08-14-draft';

export const AUTH_REASONS = Object.freeze({
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  EMAIL_VERIFICATION_REQUIRED: 'EMAIL_VERIFICATION_REQUIRED',
  ACCOUNT_SETUP_REQUIRED: 'ACCOUNT_SETUP_REQUIRED',
  LEGAL_CONSENT_REQUIRED: 'LEGAL_CONSENT_REQUIRED',
  PREFERENCES_REQUIRED: 'PREFERENCES_REQUIRED',
});

export function isPasswordProviderUser(user) {
  return Boolean(user?.providerData?.some((provider) => provider?.providerId === 'password'));
}

export function deriveAuthState(user, userDocument, loading = false) {
  if (loading) return AUTH_STATES.LOADING;
  if (!user?.uid) return AUTH_STATES.GUEST;
  if (isPasswordProviderUser(user) && !user.emailVerified) {
    return AUTH_STATES.EMAIL_VERIFICATION_REQUIRED;
  }
  const hasProfileDetails = (
    userDocument?.onboarding?.profileDetailsVersion === PROFILE_DETAILS_VERSION
    && Boolean(userDocument?.onboarding?.profileDetailsCompletedAt)
    && typeof userDocument?.displayName === 'string'
    && userDocument.displayName.trim().length >= 2
  );
  const hasLegalConsent = (
    userDocument?.legal?.termsVersion === TERMS_VERSION
    && userDocument?.legal?.privacyVersion === PRIVACY_VERSION
    && Boolean(userDocument?.legal?.acceptedAt)
  );
  if (!hasProfileDetails || !hasLegalConsent) return AUTH_STATES.ACCOUNT_SETUP_REQUIRED;
  if (userDocument?.smartProfile?.setupRequired !== false || !userDocument?.smartProfile?.completedAt) {
    return AUTH_STATES.PREFERENCES_REQUIRED;
  }
  return AUTH_STATES.READY;
}

export function authStateForReason(reason) {
  if (reason === AUTH_REASONS.EMAIL_VERIFICATION_REQUIRED) return AUTH_STATES.EMAIL_VERIFICATION_REQUIRED;
  if (reason === AUTH_REASONS.ACCOUNT_SETUP_REQUIRED || reason === AUTH_REASONS.LEGAL_CONSENT_REQUIRED) {
    return AUTH_STATES.ACCOUNT_SETUP_REQUIRED;
  }
  if (reason === AUTH_REASONS.PREFERENCES_REQUIRED) return AUTH_STATES.PREFERENCES_REQUIRED;
  if (reason === AUTH_REASONS.SIGN_IN_REQUIRED) return AUTH_STATES.GUEST;
  return null;
}
