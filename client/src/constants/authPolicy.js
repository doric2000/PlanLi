export const AUTH_STATES = Object.freeze({
  LOADING: 'loading',
  GUEST: 'guest',
  EMAIL_VERIFICATION_REQUIRED: 'emailVerificationRequired',
  ACCOUNT_SETUP_REQUIRED: 'accountSetupRequired',
  LEGAL_CONSENT_REQUIRED: 'legalConsentRequired',
  PREFERENCES_REQUIRED: 'preferencesRequired',
  READY: 'ready',
});

export const CAPABILITIES = Object.freeze({
  PUBLIC: 'public',
  SIGNED_IN: 'signedIn',
  ACTIVE: 'active',
  ACCOUNT_MANAGEMENT: 'accountManagement',
  PREFERENCES_SETUP: 'preferencesSetup',
});

export const PROFILE_DETAILS_VERSION = 1;
export const TERMS_VERSION = '2026-08-15-community-safety';
export const PRIVACY_VERSION = '2026-08-18-beta-observability';

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

export function hasCompletedProfileDetails(userDocument) {
  return Boolean(
    userDocument?.onboarding?.profileDetailsVersion === PROFILE_DETAILS_VERSION
    && Boolean(userDocument?.onboarding?.profileDetailsCompletedAt)
    && typeof userDocument?.displayName === 'string'
    && userDocument.displayName.trim().length >= 2
  );
}

export function hasAcceptedCurrentLegal(userDocument) {
  return Boolean(
    userDocument?.legal?.termsVersion === TERMS_VERSION
    && userDocument?.legal?.privacyVersion === PRIVACY_VERSION
    && Boolean(userDocument?.legal?.acceptedAt)
  );
}

export function hasCompletedAccountSetup(userDocument) {
  return hasCompletedProfileDetails(userDocument) && hasAcceptedCurrentLegal(userDocument);
}

export function hasCompletedPreferences(userDocument) {
  return Boolean(
    userDocument?.smartProfile?.setupRequired === false
    && userDocument?.smartProfile?.completedAt
  );
}

export function deriveAuthState(user, userDocument, loading = false) {
  if (loading) return AUTH_STATES.LOADING;
  if (!user?.uid) return AUTH_STATES.GUEST;
  if (isPasswordProviderUser(user) && !user.emailVerified) {
    return AUTH_STATES.EMAIL_VERIFICATION_REQUIRED;
  }
  if (!hasCompletedProfileDetails(userDocument)) return AUTH_STATES.ACCOUNT_SETUP_REQUIRED;
  if (!hasAcceptedCurrentLegal(userDocument)) return AUTH_STATES.LEGAL_CONSENT_REQUIRED;
  return AUTH_STATES.READY;
}

export function authStateForReason(reason) {
  if (reason === AUTH_REASONS.EMAIL_VERIFICATION_REQUIRED) return AUTH_STATES.EMAIL_VERIFICATION_REQUIRED;
  if (reason === AUTH_REASONS.ACCOUNT_SETUP_REQUIRED) return AUTH_STATES.ACCOUNT_SETUP_REQUIRED;
  if (reason === AUTH_REASONS.LEGAL_CONSENT_REQUIRED) return AUTH_STATES.LEGAL_CONSENT_REQUIRED;
  if (reason === AUTH_REASONS.PREFERENCES_REQUIRED) return AUTH_STATES.PREFERENCES_REQUIRED;
  if (reason === AUTH_REASONS.SIGN_IN_REQUIRED) return AUTH_STATES.GUEST;
  return null;
}
