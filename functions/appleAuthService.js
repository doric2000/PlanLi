const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;

function assertConfig(config) {
  for (const [key, value] of Object.entries(config || {})) {
    if (!String(value || '').trim()) {
      throw new HttpsError('failed-precondition', `Apple Sign In ${key} is not configured.`);
    }
  }
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createAppleClientSecret({ teamId, keyId, clientId, privateKey }, nowSeconds = Math.floor(Date.now() / 1000)) {
  assertConfig({ teamId, keyId, clientId, privateKey });
  const header = encodeJson({ alg: 'ES256', kid: keyId });
  const payload = encodeJson({
    iss: teamId,
    iat: nowSeconds,
    exp: nowSeconds + 5 * 60,
    aud: APPLE_ISSUER,
    sub: clientId,
  });
  const signingInput = `${header}.${payload}`;
  let signature;
  try {
    signature = crypto.sign('sha256', Buffer.from(signingInput), {
      key: String(privateKey).replace(/\\n/g, '\n'),
      dsaEncoding: 'ieee-p1363',
    });
  } catch {
    throw new HttpsError('failed-precondition', 'Apple Sign In private key is invalid.');
  }
  return `${signingInput}.${signature.toString('base64url')}`;
}

async function postToApple(url, params, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpsError('unavailable', 'Apple authorization service is temporarily unavailable.');
  }
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }
  if (!response.ok || body.error) {
    throw new HttpsError('failed-precondition', 'Apple authorization could not be verified. Sign in again.');
  }
  return body;
}

function decodeAppleIdentityToken(idToken) {
  try {
    const segments = String(idToken || '').split('.');
    if (segments.length !== 3) throw new Error('Invalid JWT');
    return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  } catch {
    throw new HttpsError('failed-precondition', 'Apple returned an invalid identity token.');
  }
}

function assertAppleSubject({ claims, expectedSubject, clientId, nowSeconds }) {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== APPLE_ISSUER ||
    claims.sub !== expectedSubject ||
    !audiences.includes(clientId) ||
    Number(claims.exp || 0) < nowSeconds
  ) {
    throw new HttpsError('permission-denied', 'Apple authorization does not belong to this account.');
  }
}

async function revokeAppleAuthorization({
  authorizationCode,
  expectedSubject,
  config,
  fetchImpl = fetch,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  assertConfig(config);
  if (typeof authorizationCode !== 'string' || !authorizationCode.trim() || authorizationCode.length > 4096) {
    throw new HttpsError('invalid-argument', 'A fresh Apple authorization code is required.');
  }
  if (typeof expectedSubject !== 'string' || !expectedSubject) {
    throw new HttpsError('failed-precondition', 'The Apple provider is missing from this account.');
  }
  const clientSecret = createAppleClientSecret(config, nowSeconds);
  const tokenResponse = await postToApple(APPLE_TOKEN_URL, {
    client_id: config.clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: 'authorization_code',
  }, fetchImpl);
  const claims = decodeAppleIdentityToken(tokenResponse.id_token);
  assertAppleSubject({ claims, expectedSubject, clientId: config.clientId, nowSeconds });
  const token = tokenResponse.refresh_token || tokenResponse.access_token;
  if (!token) {
    throw new HttpsError('failed-precondition', 'Apple did not return a token that can be revoked.');
  }
  await postToApple(APPLE_REVOKE_URL, {
    client_id: config.clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokenResponse.refresh_token ? 'refresh_token' : 'access_token',
  }, fetchImpl);
  return { revoked: true };
}

module.exports = {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  createAppleClientSecret,
  decodeAppleIdentityToken,
  revokeAppleAuthorization,
};
