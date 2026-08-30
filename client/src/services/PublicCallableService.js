import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';

import { auth, cloudFunctions } from '../config/firebase';
import { guestSessionStorage } from './guestSessionStorage';

const SESSION_REFRESH_SKEW_MS = 60 * 1000;
const SESSION_TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/;
const publicCallables = new Map();
let issueGuestSessionCallable;
let sessionPromise;

function errorReason(error) {
  return error?.details?.reason || error?.customData?.details?.reason || null;
}

function validateStoredSession(value, now = Date.now()) {
  try {
    const session = typeof value === 'string' ? JSON.parse(value) : value;
    const expiresAtMs = Date.parse(session?.expiresAt || '');
    if (!SESSION_TOKEN_PATTERN.test(String(session?.guestSessionToken || ''))) return null;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now + SESSION_REFRESH_SKEW_MS) return null;
    return { guestSessionToken: session.guestSessionToken, expiresAt: new Date(expiresAtMs).toISOString() };
  } catch {
    return null;
  }
}

async function createGuestSession() {
  issueGuestSessionCallable ||= httpsCallable(
    cloudFunctions,
    'issueGuestSession',
    { limitedUseAppCheckTokens: true }
  );
  const response = await issueGuestSessionCallable({});
  const session = validateStoredSession(response?.data);
  if (!session) throw new Error('Guest session response is invalid.');
  await guestSessionStorage.set(JSON.stringify(session));
  return session;
}

async function getGuestSession() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const stored = validateStoredSession(await guestSessionStorage.get());
    if (stored) return stored;
    await guestSessionStorage.clear();
    return createGuestSession();
  })();
  try {
    return await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}

async function clearGuestSession() {
  sessionPromise = null;
  await guestSessionStorage.clear();
}

function callableFor(name, options) {
  const key = `${name}:${JSON.stringify(options || {})}`;
  if (!publicCallables.has(key)) {
    publicCallables.set(key, httpsCallable(cloudFunctions, name, options));
  }
  return publicCallables.get(key);
}

async function invoke(name, payload, options, retrySession) {
  const authenticated = Boolean(auth?.currentUser?.uid);
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const securedPayload = authenticated
    ? data
    : {
      ...data,
      _security: {
        guestSessionToken: (await getGuestSession()).guestSessionToken,
        nonce: Crypto.randomUUID().replace(/-/g, ''),
      },
    };
  try {
    const response = await callableFor(name, options)(securedPayload);
    return response?.data ?? null;
  } catch (error) {
    if (
      !authenticated
      && retrySession
      && ['GUEST_SESSION_EXPIRED', 'GUEST_SESSION_INVALID', 'GUEST_SESSION_REQUIRED'].includes(errorReason(error))
    ) {
      await clearGuestSession();
      return invoke(name, payload, options, false);
    }
    throw error;
  }
}

export function callPublicCallable(name, payload = {}, options = {}) {
  return invoke(name, payload, options, true);
}

export const __publicCallableTesting = {
  clearGuestSession,
  validateStoredSession,
};
