import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
} from 'firebase/auth';

import { auth } from '../config/firebase';

export const TOTP_FACTOR_ID = 'totp';
const TOTP_CODE_PATTERN = /^\d{6}$/;

let pendingSignIn = null;
let pendingEnrollment = null;

function safeTotpCode(value) {
  const code = String(value || '').replace(/\s/g, '');
  if (!TOTP_CODE_PATTERN.test(code)) {
    const error = new Error('A six-digit TOTP code is required.');
    error.code = 'auth/invalid-verification-code';
    throw error;
  }
  return code;
}
function totpHints(resolver) {
  return (resolver?.hints || []).filter((hint) => hint?.factorId === TOTP_FACTOR_ID);
}

export function isTotpChallengeRequired(error) {
  return error?.code === 'auth/multi-factor-auth-required';
}

export function captureTotpSignIn(error, metadata = {}) {
  if (!isTotpChallengeRequired(error)) throw error;
  const resolver = getMultiFactorResolver(auth, error);
  const hints = totpHints(resolver);
  if (!hints.length) {
    const unsupported = new Error('The account requires an unsupported second factor.');
    unsupported.code = 'auth/unsupported-second-factor';
    throw unsupported;
  }
  pendingSignIn = {
    resolver,
    hint: hints[0],
    profile: metadata.profile || null,
  };
  const challenge = new Error('A TOTP challenge is required.');
  challenge.code = 'auth/multi-factor-auth-required';
  challenge.customData = { factorCount: hints.length };
  return challenge;
}

export function clearPendingTotpSignIn() {
  pendingSignIn = null;
}

export function hasPendingTotpSignIn() {
  return Boolean(pendingSignIn);
}

export async function completeTotpSignIn(verificationCode) {
  if (!pendingSignIn) {
    const error = new Error('There is no pending TOTP sign-in.');
    error.code = 'auth/missing-multi-factor-session';
    throw error;
  }
  const code = safeTotpCode(verificationCode);
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(
    pendingSignIn.hint.uid,
    code
  );
  const result = await pendingSignIn.resolver.resolveSignIn(assertion);
  const profile = pendingSignIn.profile;
  pendingSignIn = null;
  return { user: result.user, profile };
}

export function hasTotpEnrollment(user = auth.currentUser) {
  if (!user) return false;
  return multiFactor(user).enrolledFactors.some((factor) => factor?.factorId === TOTP_FACTOR_ID);
}

export async function beginTotpEnrollment() {
  const user = auth.currentUser;
  if (!user?.uid) {
    const error = new Error('An authenticated user is required.');
    error.code = 'auth/user-not-found';
    throw error;
  }
  if (hasTotpEnrollment(user)) {
    const error = new Error('TOTP is already enrolled.');
    error.code = 'auth/second-factor-already-in-use';
    throw error;
  }
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  pendingEnrollment = { uid: user.uid, secret };
  return {
    secretKey: secret.secretKey,
    qrCodeUrl: secret.generateQrCodeUrl(user.email || user.uid, 'PlanLi'),
    expiresAt: secret.enrollmentCompletionDeadline || null,
  };
}

export function cancelTotpEnrollment() {
  pendingEnrollment = null;
}

export async function finishTotpEnrollment(verificationCode) {
  const user = auth.currentUser;
  if (!user?.uid || !pendingEnrollment || pendingEnrollment.uid !== user.uid) {
    const error = new Error('The TOTP enrollment session is missing or belongs to another user.');
    error.code = 'auth/missing-multi-factor-session';
    throw error;
  }
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
    pendingEnrollment.secret,
    safeTotpCode(verificationCode)
  );
  await multiFactor(user).enroll(assertion, 'PlanLi Authenticator');
  pendingEnrollment = null;
  await user.getIdToken(true);
  return { enrolled: true };
}
