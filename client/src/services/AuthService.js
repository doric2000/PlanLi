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
  reauthenticateWithCredential,
  signInWithCredential,
  updateProfile,
} from 'firebase/auth';

import { auth } from '../config/firebase';
import { registerUserDocument } from './ProfileService';
import { getUserTier } from '../utils/userTier';

export const DEFAULT_DISPLAY_NAME = 'מטייל/ת PlanLi';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const NONCE_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
let googleConfigured = false;

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const formatAuthError = (error) => {
  const code = String(error?.code || '');
  if (code === 'auth/account-exists-with-different-credential' || code === 'auth/email-already-in-use') {
    return 'כבר קיים חשבון עם כתובת האימייל הזו. התחברו באמצעות שיטת ההתחברות המקורית.';
  }
  if (code === 'auth/invalid-email') return 'כתובת האימייל אינה תקינה.';
  if (code === 'auth/user-disabled') return 'החשבון הושבת. פנו לתמיכה לקבלת עזרה.';
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'האימייל או הסיסמה שגויים.';
  }
  if (code === 'auth/weak-password') return 'הסיסמה חלשה מדי. השתמשו בלפחות 6 תווים.';
  if (code === 'auth/network-request-failed' || code === 'functions/unavailable') {
    return 'לא הצלחנו להתחבר לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
  }
  if (code === 'auth/too-many-requests') return 'בוצעו יותר מדי ניסיונות. המתינו מעט ונסו שוב.';
  if (code === 'auth/requires-recent-login') return 'מטעמי אבטחה צריך להתחבר מחדש ולנסות שוב.';
  if (code === 'auth/user-mismatch') return 'החשבון שנבחר אינו החשבון שמחובר כעת. נסו שוב עם החשבון המקורי.';
  if (code === 'DEVELOPER_ERROR' || /DEVELOPER_ERROR|configuration error/i.test(String(error?.message || ''))) {
    return 'התחברות Google אינה מוגדרת נכון בגרסה הזו. יש לבדוק את הגדרות ה־OAuth.';
  }
  if (code === 'functions/failed-precondition') return 'האימות החדש אינו תקף עוד. התחברו מחדש ונסו שוב.';
  if (code === 'functions/permission-denied') return 'האימות אינו שייך לחשבון המחובר.';
  if (code === 'functions/invalid-argument') return 'בקשת האימות אינה תקינה. נסו שוב.';
  if (code === 'auth/missing-or-invalid-nonce') return 'אימות Apple נכשל. נסו להתחבר מחדש.';
  if (code === 'auth/provider-not-configured') return 'שיטת ההתחברות עדיין אינה מוגדרת בגרסה הזו.';
  if (code === 'auth/missing-token') return 'ספק ההתחברות לא החזיר אישור תקין. נסו שוב.';
  if (code === 'auth/profile-bootstrap-failed') return 'לא הצלחנו להכין את הפרופיל. נסו שוב.';
  return error?.message || 'אירעה שגיאה. נסו שוב.';
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
  if (!GOOGLE_WEB_CLIENT_ID) {
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
  const userCredential = await signInWithCredential(auth, providerResult.credential);
  await applyFirstProviderName(userCredential.user, providerResult.profile.displayName);
  return { user: userCredential.user, profile: providerResult.profile };
}

export async function signInWithApple() {
  const providerResult = await getAppleCredential();
  const userCredential = await signInWithCredential(auth, providerResult.credential);
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

export async function completeAuthentication(user, profile = {}) {
  const registration = await ensureAuthenticatedUserProfile(user, profile);
  if (getUserTier(user) === 'unverified') {
    return { registration, routeName: 'VerifyEmail' };
  }
  return {
    registration,
    routeName: registration?.setupRequired ? 'PreferenceSetup' : 'Main',
  };
}

export const getProviderIds = (user) => (
  (user?.providerData || []).map((provider) => provider?.providerId).filter(Boolean)
);
