import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isCancelledResponse,
} from '@react-native-google-signin/google-signin';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  updateProfile,
  validatePassword,
} from 'firebase/auth';

import { auth } from '../config/firebase';
import { unregisterNotificationDeviceBeforeSignOut } from '../features/notifications/push/session';
import { completeAccountSetup, registerUserDocument } from './ProfileService';
import { captureTotpSignIn } from './MfaService';

export const DEFAULT_DISPLAY_NAME = 'מטייל/ת PlanLi';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID_PATTERN = /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const NONCE_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
let googleConfigured = false;

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
export const isValidGoogleWebClientId = (value) => (
  GOOGLE_WEB_CLIENT_ID_PATTERN.test(String(value || '').trim())
);

export const formatAuthError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'auth/account-exists-with-different-credential' || code === 'auth/email-already-in-use') {
    return 'כבר קיים חשבון עם כתובת האימייל הזו. התחברו באמצעות שיטת ההתחברות המקורית.';
  }
  if (code === 'auth/invalid-email') return 'כתובת האימייל אינה תקינה.';
  if (code === 'auth/user-disabled') return 'החשבון הושבת. פנו לתמיכה לקבלת עזרה.';
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'האימייל או הסיסמה שגויים.';
  }
  if (code === 'auth/weak-password') return 'הסיסמה אינה עומדת במדיניות האבטחה. השתמשו בלפחות 10 תווים.';
  if (code === 'auth/network-request-failed' || code === 'functions/unavailable') {
    return 'לא הצלחנו להתחבר לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
  }
  if (code === 'auth/too-many-requests') return 'בוצעו יותר מדי ניסיונות. המתינו מעט ונסו שוב.';
  if (code === 'auth/requires-recent-login') return 'מטעמי אבטחה צריך להתחבר מחדש ולנסות שוב.';
  if (code === 'auth/invalid-verification-code') return 'קוד האימות אינו תקין. הזינו את ששת הספרות שמופיעות באפליקציית האימות.';
  if (code === 'auth/missing-multi-factor-session') return 'תהליך האימות פג. התחילו את ההתחברות מחדש.';
  if (code === 'auth/unsupported-second-factor') return 'החשבון מוגדר עם אמצעי אימות שאינו נתמך. פנו למנהל המערכת.';
  if (code === 'auth/second-factor-already-in-use') return 'אימות באמצעות אפליקציית אימות כבר פעיל בחשבון הזה.';
  if (code === 'auth/user-mismatch') return 'החשבון שנבחר אינו החשבון שמחובר כעת. נסו שוב עם החשבון המקורי.';
  if (
    code === 'DEVELOPER_ERROR'
    || /DEVELOPER_ERROR|configuration error|invalid_audience|not a valid client id/i.test(message)
  ) {
    return 'התחברות Google אינה מוגדרת נכון בגרסה הזו. יש לבדוק את הגדרות ה־OAuth.';
  }
  if (code === 'functions/failed-precondition') return 'האימות החדש אינו תקף עוד. התחברו מחדש ונסו שוב.';
  if (code === 'functions/permission-denied') return 'האימות אינו שייך לחשבון המחובר.';
  if (code === 'functions/invalid-argument') return 'בקשת האימות אינה תקינה. נסו שוב.';
  if (code === 'auth/missing-or-invalid-nonce') return 'אימות Apple נכשל. נסו להתחבר מחדש.';
  if (code === 'auth/provider-not-configured') return 'שיטת ההתחברות עדיין אינה מוגדרת בגרסה הזו.';
  if (code === 'auth/missing-token') return 'ספק ההתחברות לא החזיר אישור תקין. נסו שוב.';
  if (code === 'auth/profile-bootstrap-failed') return 'לא הצלחנו להכין את הפרופיל. נסו שוב.';
  if (code === 'profile/account-setup-persistence-mismatch') {
    return 'האישור לא נשמר בגרסה הנוכחית. יש לעדכן את שירות השרת לפני ניסיון נוסף.';
  }
  return 'אירעה שגיאה בתהליך האימות. נסו שוב.';
};

export const isProviderCancellation = (error) => (
  error?.code === 'ERR_REQUEST_CANCELED' || error?.code === 'auth/provider-cancelled'
);

const providerCancellation = () => {
  const error = new Error('Provider sign-in was cancelled.');
  error.code = 'auth/provider-cancelled';
  return error;
};

const missingToken = () => {
  const error = new Error('The identity provider did not return an ID token.');
  error.code = 'auth/missing-token';
  return error;
};

function configureGoogle() {
  if (googleConfigured) return;
  if (!isValidGoogleWebClientId(GOOGLE_WEB_CLIENT_ID)) {
    const error = new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not configured.');
    error.code = 'auth/provider-not-configured';
    throw error;
  }
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  googleConfigured = true;
}

async function getGoogleCredential() {
  configureGoogle();
  const response = await GoogleSignin.signIn();
  if (isCancelledResponse(response)) throw providerCancellation();
  const idToken = response?.data?.idToken;
  if (!idToken) throw missingToken();
  return {
    credential: GoogleAuthProvider.credential(idToken),
    profile: {
      displayName: response.data.user?.name || undefined,
      photoURL: response.data.user?.photo || undefined,
    },
  };
}

async function createAppleNonce() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const rawNonce = Array.from(bytes, (byte) => NONCE_CHARACTERS[byte % NONCE_CHARACTERS.length]).join('');
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  return { rawNonce, hashedNonce };
}

async function getAppleCredential() {
  const { rawNonce, hashedNonce } = await createAppleNonce();
  const response = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!response?.identityToken) throw missingToken();
  const provider = new OAuthProvider('apple.com');
  const displayName = response.fullName
    ? AppleAuthentication.formatFullName(response.fullName).trim()
    : '';
  return {
    credential: provider.credential({ idToken: response.identityToken, rawNonce }),
    authorizationCode: response.authorizationCode || null,
    profile: { displayName: displayName || undefined, photoURL: undefined },
  };
}

async function applyFirstProviderName(user, displayName) {
  if (!user || user.displayName || !displayName) return;
  await updateProfile(user, { displayName });
}

export async function signInWithGoogle() {
  const providerResult = await getGoogleCredential();
  let userCredential;
  try {
    userCredential = await signInWithCredential(auth, providerResult.credential);
  } catch (error) {
    throw captureTotpSignIn(error, { profile: providerResult.profile });
  }
  await applyFirstProviderName(userCredential.user, providerResult.profile.displayName);
  return { user: userCredential.user, profile: providerResult.profile };
}

export async function signInWithEmail(email, password) {
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  } catch (error) {
    throw captureTotpSignIn(error);
  }
  await ensureAuthenticatedUserProfile(credential.user);
  return credential.user;
}

export async function validateNewPassword(password) {
  if (String(password || '').length < 10) {
    return { isValid: false, message: 'הסיסמה חייבת להכיל לפחות 10 תווים.' };
  }
  try {
    const status = await validatePassword(auth, password);
    if (status.isValid) return { isValid: true, status };
    return {
      isValid: false,
      status,
      message: 'הסיסמה אינה עומדת במדיניות האבטחה של החשבון.',
    };
  } catch (error) {
    if (error?.code === 'auth/operation-not-allowed') return { isValid: true };
    throw error;
  }
}

export async function registerWithEmail({ displayName, email, password, acceptedLegal }) {
  const normalizedEmail = normalizeEmail(email);
  const pendingUser = auth.currentUser
    && normalizeEmail(auth.currentUser.email) === normalizedEmail
    && getProviderIds(auth.currentUser).includes('password')
    ? auth.currentUser
    : null;
  const user = pendingUser || (
    await createUserWithEmailAndPassword(auth, normalizedEmail, password)
  ).user;
  await updateProfile(user, { displayName });
  await ensureAuthenticatedUserProfile(user, { displayName, photoURL: null });
  await completeAccountSetup({ displayName, acceptedLegal });
  auth.languageCode = 'he';
  await sendEmailVerification(user);
  return user;
}

export async function sendResetEmail(email) {
  auth.languageCode = 'he';
  try {
    await sendPasswordResetEmail(auth, normalizeEmail(email));
  } catch (error) {
    if (['auth/user-not-found', 'auth/invalid-credential'].includes(error?.code)) return;
    throw error;
  }
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) {
    const error = new Error('No authenticated user.');
    error.code = 'auth/user-not-found';
    throw error;
  }
  auth.languageCode = 'he';
  await sendEmailVerification(auth.currentUser);
}

export async function refreshAuthenticatedUser() {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

export async function signOutCentral() {
  await unregisterNotificationDeviceBeforeSignOut();
  const providerIds = getProviderIds(auth.currentUser);
  if (providerIds.includes('google.com')) {
    await GoogleSignin.signOut().catch(() => {});
  }
  await signOut(auth);
}

export async function revokeGoogleAccessForDeletion() {
  if (!getProviderIds(auth.currentUser).includes('google.com')) return;
  await GoogleSignin.revokeAccess();
}

export async function signInWithApple() {
  const providerResult = await getAppleCredential();
  let userCredential;
  try {
    userCredential = await signInWithCredential(auth, providerResult.credential);
  } catch (error) {
    throw captureTotpSignIn(error, { profile: providerResult.profile });
  }
  await applyFirstProviderName(userCredential.user, providerResult.profile.displayName);
  return { user: userCredential.user, profile: providerResult.profile };
}

export async function reauthenticateWithGoogle() {
  if (!auth.currentUser) throw new Error('No authenticated user.');
  const providerResult = await getGoogleCredential();
  await reauthenticateWithCredential(auth.currentUser, providerResult.credential);
  return {};
}

export async function reauthenticateWithApple() {
  if (!auth.currentUser) throw new Error('No authenticated user.');
  const providerResult = await getAppleCredential();
  await reauthenticateWithCredential(auth.currentUser, providerResult.credential);
  if (!providerResult.authorizationCode) throw missingToken();
  return { appleAuthorizationCode: providerResult.authorizationCode };
}

export async function reauthenticateWithPassword(password) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('No authenticated password user.');
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  return {};
}

export async function ensureAuthenticatedUserProfile(user, profile = {}) {
  if (!user?.uid) {
    const error = new Error('No authenticated user.');
    error.code = 'auth/profile-bootstrap-failed';
    throw error;
  }
  return registerUserDocument({
    displayName: profile.displayName || user.displayName || DEFAULT_DISPLAY_NAME,
    photoURL: profile.photoURL || user.photoURL || null,
  });
}

export const getProviderIds = (user) => (
  (user?.providerData || []).map((provider) => provider?.providerId).filter(Boolean)
);
