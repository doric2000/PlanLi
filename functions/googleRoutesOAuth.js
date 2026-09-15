const { GoogleAuth } = require('google-auth-library');
const { HttpsError } = require('firebase-functions/v2/https');

const { billingProjectId } = require('./googleMapsOAuth');

const ROUTES_OAUTH_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/cloud-platform',
]);
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

let authClientPromise = null;
let cachedToken = null;

async function defaultAuthClient() {
  if (!authClientPromise) {
    const auth = new GoogleAuth({ scopes: ROUTES_OAUTH_SCOPES });
    authClientPromise = auth.getClient();
  }
  return authClientPromise;
}

function tokenValue(response) {
  return typeof response === 'string' ? response : response?.token;
}

async function getGoogleRoutesAccessToken({ forceRefresh = false, now = Date.now() } = {}) {
  if (!forceRefresh && cachedToken?.token && cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
    return cachedToken.token;
  }
  const client = await defaultAuthClient();
  if (forceRefresh && client.credentials) {
    client.credentials.access_token = null;
    client.credentials.expiry_date = 0;
  }
  const response = await client.getAccessToken();
  const token = tokenValue(response);
  if (!token) {
    throw new HttpsError('failed-precondition', 'Google Routes credentials are unavailable.', {
      reason: 'ROUTES_CREDENTIALS_UNAVAILABLE',
    });
  }
  const expiry = Number(client.credentials?.expiry_date || 0);
  cachedToken = { token, expiresAtMs: expiry > now ? expiry : now + 30 * 60 * 1000 };
  return token;
}

function resetGoogleRoutesOAuthForTests() {
  authClientPromise = null;
  cachedToken = null;
}

module.exports = {
  ROUTES_OAUTH_SCOPES,
  TOKEN_REFRESH_SKEW_MS,
  billingProjectId,
  getGoogleRoutesAccessToken,
  resetGoogleRoutesOAuthForTests,
};
