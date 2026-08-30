const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const COSTS = Object.freeze({
  discovery: 3,
  destinationOverview: 4,
  map: 10,
  routeDetails: 4,
});
const WINDOW_MS = 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ISSUANCE_WINDOW_MS = 10 * 60 * 1000;
const USER_WINDOW_MAXIMUM = 240;
const GUEST_WINDOW_MAXIMUM = 120;
const GLOBAL_WINDOW_MAXIMUM = 1200;
const NETWORK_ISSUANCE_MAXIMUM = 20;
const GLOBAL_ISSUANCE_MAXIMUM = 300;
const TOKEN_PATTERN = /^v1\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

function rateLimitError(reason, message = 'Too many requests. Please try again shortly.') {
  return new HttpsError('resource-exhausted', message, { reason });
}

function guestSessionError(code, reason, message) {
  return new HttpsError(code, message, { reason });
}

function requireSigningKey(key) {
  const normalized = typeof key === 'string' ? key.trim() : '';
  if (normalized.length < 32) {
    throw new Error('PUBLIC_RATE_LIMIT_KEY must contain at least 32 characters.');
  }
  return normalized;
}

function hmac(key, value) {
  return crypto.createHmac('sha256', requireSigningKey(key)).update(value).digest('base64url');
}

function normalizedNetworkAddress(request) {
  const raw = String(request?.rawRequest?.socket?.remoteAddress || 'unknown').trim().toLowerCase();
  if (!raw || raw.length > 128 || /[\u0000-\u001f\u007f]/.test(raw)) return 'unknown';
  if (raw.includes('.')) return raw.split('.').slice(0, 3).join('.');
  return raw.split(':').slice(0, 4).join(':');
}

function verifiedAppId(request) {
  const appId = typeof request?.app?.appId === 'string' ? request.app.appId.trim() : '';
  if (!appId || appId.length > 200 || /[\u0000-\u001f\u007f/]/.test(appId)) {
    throw guestSessionError('unauthenticated', 'APP_CHECK_REQUIRED', 'A valid App Check token is required.');
  }
  return appId;
}

function assertFreshLimitedUseAppCheck(request) {
  const appId = verifiedAppId(request);
  if (request?.app?.alreadyConsumed === true) {
    throw guestSessionError('permission-denied', 'APP_CHECK_REPLAYED', 'This App Check token was already consumed.');
  }
  return appId;
}

function assertEmptyIssuePayload(data) {
  if (data == null) return;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 0) {
    throw guestSessionError('invalid-argument', 'INVALID_GUEST_SESSION_REQUEST', 'Guest session request must be empty.');
  }
}

function createGuestSessionToken({ appId, key, randomBytes = crypto.randomBytes }) {
  const sessionId = randomBytes(24).toString('base64url');
  const signature = hmac(key, `guest-session|v1|${appId}|${sessionId}`);
  return `v1.${sessionId}.${signature}`;
}

function parseAndVerifyGuestSessionToken({ token, appId, key }) {
  const match = TOKEN_PATTERN.exec(typeof token === 'string' ? token : '');
  if (!match) {
    throw guestSessionError('unauthenticated', 'GUEST_SESSION_REQUIRED', 'A valid guest session is required.');
  }
  const [, sessionId, signature] = match;
  const expected = hmac(key, `guest-session|v1|${appId}|${sessionId}`);
  const receivedBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expected, 'base64url');
  if (
    receivedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw guestSessionError('unauthenticated', 'GUEST_SESSION_INVALID', 'The guest session is invalid.');
  }
  return {
    sessionId,
    documentId: `g_${hmac(key, `guest-session-document|${token}`)}`,
    tokenDigest: hmac(key, `guest-session-digest|${token}`),
  };
}

function normalizedSecurityEnvelope(data) {
  const envelope = data?._security;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw guestSessionError('unauthenticated', 'GUEST_SESSION_REQUIRED', 'A guest session is required.');
  }
  const keys = Object.keys(envelope);
  if (keys.some((field) => !['guestSessionToken', 'nonce'].includes(field))) {
    throw guestSessionError('invalid-argument', 'INVALID_SECURITY_ENVELOPE', 'The security envelope is invalid.');
  }
  const nonce = typeof envelope.nonce === 'string' ? envelope.nonce : '';
  if (!NONCE_PATTERN.test(nonce)) {
    throw guestSessionError('invalid-argument', 'INVALID_REQUEST_NONCE', 'A valid request nonce is required.');
  }
  return { guestSessionToken: envelope.guestSessionToken, nonce };
}

function withoutPublicSecurityEnvelope(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const sanitized = { ...data };
  delete sanitized._security;
  return sanitized;
}

function activeWindow(previous, now, durationMs = WINDOW_MS) {
  const windowStartedAtMs = Number(previous?.windowStartedAtMs || 0);
  const active = now - windowStartedAtMs >= 0 && now - windowStartedAtMs < durationMs;
  return {
    used: active ? Number(previous?.used || 0) : 0,
    windowStartedAtMs: active ? windowStartedAtMs : now,
  };
}

function assertBudget(previous, { cost, maximum, now, durationMs = WINDOW_MS, reason }) {
  const state = activeWindow(previous, now, durationMs);
  if (!Number.isFinite(state.used) || state.used < 0 || state.used + cost > maximum) {
    throw rateLimitError(reason);
  }
  return state;
}

async function issueGuestSession({ admin, request, key, now = Date.now(), randomBytes }) {
  assertEmptyIssuePayload(request?.data);
  const appId = assertFreshLimitedUseAppCheck(request);
  const signingKey = requireSigningKey(key);
  const guestSessionToken = createGuestSessionToken({ appId, key: signingKey, randomBytes });
  const parsed = parseAndVerifyGuestSessionToken({ token: guestSessionToken, appId, key: signingKey });
  const networkHash = hmac(signingKey, `issuance-network|${normalizedNetworkAddress(request)}`);
  const expiresAtMs = now + SESSION_TTL_MS;
  const db = admin.firestore();
  const sessionRef = db.doc(`system/runtime/guestSessions/${parsed.documentId}`);
  const globalRef = db.doc('system/runtime/guestSessionIssuance/global');
  const networkRef = db.doc(`system/runtime/guestSessionIssuance/n_${networkHash}`);

  await db.runTransaction(async (transaction) => {
    const globalState = assertBudget((await transaction.get(globalRef)).data(), {
      cost: 1,
      maximum: GLOBAL_ISSUANCE_MAXIMUM,
      now,
      durationMs: ISSUANCE_WINDOW_MS,
      reason: 'GLOBAL_GUEST_SESSION_LIMIT',
    });
    const networkState = assertBudget((await transaction.get(networkRef)).data(), {
      cost: 1,
      maximum: NETWORK_ISSUANCE_MAXIMUM,
      now,
      durationMs: ISSUANCE_WINDOW_MS,
      reason: 'NETWORK_GUEST_SESSION_LIMIT',
    });
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(globalRef, {
      used: globalState.used + 1,
      windowStartedAtMs: globalState.windowStartedAtMs,
      expireAt: new Date(now + 2 * ISSUANCE_WINDOW_MS),
      updatedAt: timestamp,
    });
    transaction.set(networkRef, {
      used: networkState.used + 1,
      windowStartedAtMs: networkState.windowStartedAtMs,
      expireAt: new Date(now + 2 * ISSUANCE_WINDOW_MS),
      updatedAt: timestamp,
    });
    transaction.create(sessionRef, {
      appId,
      status: 'active',
      tokenDigest: parsed.tokenDigest,
      issuedAtMs: now,
      expiresAtMs,
      expireAt: new Date(expiresAtMs),
      updatedAt: timestamp,
    });
  });

  return { guestSessionToken, expiresAt: new Date(expiresAtMs).toISOString() };
}

async function consumePublicReadBudget({ admin, auth, request, action, key, now = Date.now() }) {
  const cost = COSTS[action];
  if (!cost) throw new Error(`Unknown public rate-limit action: ${action || '<empty>'}`);
  const signingKey = requireSigningKey(key);
  const db = admin.firestore();
  const globalRef = db.doc('system/runtime/publicRateLimits/_global');
  let sessionContext = null;
  let id;
  let nonceRef = null;

  if (auth?.uid) {
    id = `u_${auth.uid}`;
  } else {
    const appId = verifiedAppId(request);
    const envelope = normalizedSecurityEnvelope(request?.data);
    const parsed = parseAndVerifyGuestSessionToken({
      token: envelope.guestSessionToken,
      appId,
      key: signingKey,
    });
    sessionContext = { ...parsed, appId, nonce: envelope.nonce };
    id = parsed.documentId;
    const nonceId = hmac(signingKey, `guest-session-nonce|${parsed.documentId}|${envelope.nonce}`);
    nonceRef = db.doc(`system/runtime/guestSessionNonces/n_${nonceId}`);
  }

  const rateRef = db.doc(`system/runtime/publicRateLimits/${id}`);
  await db.runTransaction(async (transaction) => {
    if (sessionContext) {
      const sessionRef = db.doc(`system/runtime/guestSessions/${sessionContext.documentId}`);
      const sessionSnapshot = await transaction.get(sessionRef);
      const session = sessionSnapshot.exists ? sessionSnapshot.data() : null;
      if (
        !session
        || session.status !== 'active'
        || session.appId !== sessionContext.appId
        || session.tokenDigest !== sessionContext.tokenDigest
        || Number(session.expiresAtMs || 0) <= now
      ) {
        throw guestSessionError('unauthenticated', 'GUEST_SESSION_EXPIRED', 'The guest session is invalid or expired.');
      }
      if ((await transaction.get(nonceRef)).exists) {
        throw guestSessionError('already-exists', 'GUEST_SESSION_REPLAY', 'This guest request was already processed.');
      }
    }

    const globalState = assertBudget((await transaction.get(globalRef)).data(), {
      cost,
      maximum: GLOBAL_WINDOW_MAXIMUM,
      now,
      reason: 'GLOBAL_PUBLIC_READ_LIMIT',
    });
    const principalState = assertBudget((await transaction.get(rateRef)).data(), {
      cost,
      maximum: auth?.uid ? USER_WINDOW_MAXIMUM : GUEST_WINDOW_MAXIMUM,
      now,
      reason: auth?.uid ? 'USER_PUBLIC_READ_LIMIT' : 'GUEST_PUBLIC_READ_LIMIT',
    });
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(globalRef, {
      lastAction: action,
      used: globalState.used + cost,
      windowStartedAtMs: globalState.windowStartedAtMs,
      expireAt: new Date(now + 10 * WINDOW_MS),
      updatedAt: timestamp,
    });
    transaction.set(rateRef, {
      lastAction: action,
      used: principalState.used + cost,
      windowStartedAtMs: principalState.windowStartedAtMs,
      expireAt: new Date(now + 10 * WINDOW_MS),
      updatedAt: timestamp,
    });
    if (sessionContext) {
      transaction.create(nonceRef, {
        sessionId: sessionContext.documentId,
        expireAt: new Date(now + SESSION_TTL_MS),
        createdAt: timestamp,
      });
    }
  });
  return { data: withoutPublicSecurityEnvelope(request?.data), principalId: id };
}

module.exports = {
  COSTS,
  GLOBAL_WINDOW_MAXIMUM,
  GUEST_WINDOW_MAXIMUM,
  SESSION_TTL_MS,
  USER_WINDOW_MAXIMUM,
  consumePublicReadBudget,
  createGuestSessionToken,
  issueGuestSession,
  normalizedNetworkAddress,
  parseAndVerifyGuestSessionToken,
  withoutPublicSecurityEnvelope,
};
