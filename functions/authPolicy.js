const { HttpsError } = require('firebase-functions/v2/https');

const ACCESS_LEVELS = Object.freeze({
  PUBLIC: 'public',
  SIGNED_IN: 'signedIn',
  ACTIVE: 'active',
});

const AUTH_REASONS = Object.freeze({
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  EMAIL_VERIFICATION_REQUIRED: 'EMAIL_VERIFICATION_REQUIRED',
  ACCOUNT_SETUP_REQUIRED: 'ACCOUNT_SETUP_REQUIRED',
  LEGAL_CONSENT_REQUIRED: 'LEGAL_CONSENT_REQUIRED',
  PREFERENCES_REQUIRED: 'PREFERENCES_REQUIRED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
});

const PROFILE_DETAILS_VERSION = 1;
const TERMS_VERSION = '2026-08-15-community-safety';
const PRIVACY_VERSION = '2026-08-15-community-safety';

function policyError(code, message, reason) {
  return new HttpsError(code, message, { reason });
}

function isPasswordProvider(auth) {
  return auth?.token?.firebase?.sign_in_provider === 'password';
}

function assertSignedIn(auth) {
  if (!auth?.uid) {
    throw policyError('unauthenticated', 'Authentication is required.', AUTH_REASONS.SIGN_IN_REQUIRED);
  }
}

function assertAccountSetupComplete(auth, userDocument) {
  assertSignedIn(auth);
  if (isPasswordProvider(auth) && auth.token?.email_verified !== true) {
    throw policyError(
      'failed-precondition',
      'Email verification is required.',
      AUTH_REASONS.EMAIL_VERIFICATION_REQUIRED
    );
  }
  const displayName = typeof userDocument?.displayName === 'string'
    ? userDocument.displayName.trim()
    : '';
  const profileComplete = (
    userDocument?.onboarding?.profileDetailsVersion === PROFILE_DETAILS_VERSION
    && Boolean(userDocument?.onboarding?.profileDetailsCompletedAt)
    && displayName.length >= 2
  );
  if (!profileComplete) {
    throw policyError(
      'failed-precondition',
      'Account setup is required.',
      AUTH_REASONS.ACCOUNT_SETUP_REQUIRED
    );
  }
  const legalComplete = (
    userDocument?.legal?.termsVersion === TERMS_VERSION
    && userDocument?.legal?.privacyVersion === PRIVACY_VERSION
    && Boolean(userDocument?.legal?.acceptedAt)
  );
  if (!legalComplete) {
    throw policyError(
      'failed-precondition',
      'Current legal consent is required.',
      AUTH_REASONS.LEGAL_CONSENT_REQUIRED
    );
  }
}

function assertActiveUser(auth, userDocument) {
  assertAccountSetupComplete(auth, userDocument);
  if (userDocument?.smartProfile?.setupRequired !== false || !userDocument?.smartProfile?.completedAt) {
    throw policyError(
      'failed-precondition',
      'Travel preferences are required.',
      AUTH_REASONS.PREFERENCES_REQUIRED
    );
  }
}

async function authorizeRequest({ admin, auth, access, allowSuspended = false }) {
  if (!Object.values(ACCESS_LEVELS).includes(access)) {
    throw new Error(`Callable access level is missing or invalid: ${access || '<empty>'}`);
  }
  if (access === ACCESS_LEVELS.PUBLIC) return { access, userDocument: null };
  assertSignedIn(auth);
  const snapshot = await admin.firestore().doc(`users/${auth.uid}`).get();
  const userDocument = snapshot.exists ? snapshot.data() : null;
  if (!allowSuspended && userDocument?.moderation?.status === 'suspended') {
    throw policyError(
      'permission-denied',
      'This account is suspended.',
      AUTH_REASONS.ACCOUNT_SUSPENDED
    );
  }
  if (access === ACCESS_LEVELS.SIGNED_IN) return { access, userDocument };
  assertActiveUser(auth, userDocument);
  return { access, userDocument };
}

module.exports = {
  ACCESS_LEVELS,
  AUTH_REASONS,
  PRIVACY_VERSION,
  PROFILE_DETAILS_VERSION,
  TERMS_VERSION,
  assertAccountSetupComplete,
  assertActiveUser,
  assertSignedIn,
  authorizeRequest,
};
