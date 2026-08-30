const { GoogleAuth } = require('google-auth-library');
const { HttpsError } = require('firebase-functions/v2/https');

const MAPS_OAUTH_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/maps-platform.places',
  'https://www.googleapis.com/auth/maps-platform.geocode',
]);
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

let authClientPromise = null;
let cachedToken = null;

function billingProjectId(explicitProjectId = '') {
  const projectId = String(
    explicitProjectId
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || ''
  ).trim();
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) {
    throw new HttpsError('failed-precondition', 'Google Maps OAuth billing project is not configured.');
  }
  return projectId;
}

async function defaultAuthClient() {
  if (!authClientPromise) {
    const auth = new GoogleAuth({ scopes: MAPS_OAUTH_SCOPES });
    authClientPromise = auth.getClient();
  }
  return authClientPromise;
}

function tokenValue(response) {
  return typeof response === 'string' ? response : response?.token;
}

async function getGoogleMapsAccessToken({ forceRefresh = false, now = Date.now() } = {}) {
  if (
    !forceRefresh
    && cachedToken?.token
    && cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now
  ) return cachedToken.token;

  const client = await defaultAuthClient();
  if (forceRefresh && client.credentials) {
    client.credentials.access_token = null;
    client.credentials.expiry_date = 0;
  }
  const response = await client.getAccessToken();
  const token = tokenValue(response);
  if (!token) {
    throw new HttpsError('failed-precondition', 'Google Maps OAuth credentials are unavailable.');
  }
  const expiry = Number(client.credentials?.expiry_date || 0);
  cachedToken = {
    token,
    expiresAtMs: expiry > now ? expiry : now + 30 * 60 * 1000,
  };
  return token;
}

function resetGoogleMapsOAuthForTests() {
  authClientPromise = null;
  cachedToken = null;
}

module.exports = {
  MAPS_OAUTH_SCOPES,
  TOKEN_REFRESH_SKEW_MS,
  billingProjectId,
  getGoogleMapsAccessToken,
  resetGoogleMapsOAuthForTests,
};
