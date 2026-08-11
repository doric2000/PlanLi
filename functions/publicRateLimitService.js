const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const COSTS = Object.freeze({
  discovery: 3,
  destinationOverview: 4,
  map: 10,
  routeDetails: 4,
});
const WINDOW_MS = 60 * 1000;

function normalizedIp(request) {
  const ip = String(
    request?.rawRequest?.ip ||
    request?.rawRequest?.socket?.remoteAddress ||
    'unknown'
  ).trim();
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.');
  return ip.split(':').slice(0, 4).join(':');
}

function principal({ auth, request, key }) {
  if (auth?.uid) return `u_${auth.uid}`;
  const verifiedAppId = request?.app?.appId
    ? String(request.app.appId)
    : 'unverified-app';
  return `a_${crypto.createHmac('sha256', key || 'local-development-key').update(`${verifiedAppId}|${normalizedIp(request)}`).digest('base64url')}`;
}

async function consumePublicReadBudget({ admin, auth, request, action, key, now = Date.now() }) {
  const cost = COSTS[action];
  if (!cost) return;
  const maximum = auth?.uid ? 240 : 120;
  const id = principal({ auth, request, key });
  const ref = admin.firestore().doc(`system/runtime/publicRateLimits/${id}_${action}`);
  await admin.firestore().runTransaction(async (transaction) => {
    const previous = (await transaction.get(ref)).data() || {};
    const active = now - Number(previous.windowStartedAtMs || 0) < WINDOW_MS;
    const used = active ? Number(previous.used || 0) : 0;
    if (used + cost > maximum) throw new HttpsError('resource-exhausted', 'Too many requests. Please try again shortly.');
    transaction.set(ref, {
      action, used: used + cost, windowStartedAtMs: active ? previous.windowStartedAtMs : now,
      expireAt: new Date(now + 10 * WINDOW_MS), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

module.exports = { COSTS, consumePublicReadBudget, normalizedIp, principal };
