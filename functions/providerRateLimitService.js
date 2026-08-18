const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const PROVIDER_COSTS = Object.freeze({
  autocomplete: 1,
  // One localized details request in Hebrew and one in English. Destination
  // hierarchy work is charged separately through localityResolution.
  bilingualResolution: 2,
  localityResolution: 3,
});
const MINUTE_WINDOW_MS = 60 * 1000;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MINUTE_MAXIMUM = 10;
const DAY_MAXIMUM = 25;
const PROVIDER_BUDGET_VERSION = 4;
const PROVIDER_CALLABLE_LIMITS = Object.freeze({ concurrency: 4, maxInstances: 1 });
const PROVIDER_ROUTE_CALLABLE_LIMITS = Object.freeze({ concurrency: 4, maxInstances: 1 });

function providerPrincipal(uid, key) {
  return crypto
    .createHmac('sha256', key || 'local-development-key')
    .update(String(uid))
    .digest('base64url');
}

function bucketState(previous, now, windowMs) {
  const active = now - Number(previous.windowStartedAtMs || 0) < windowMs;
  return {
    used: active ? Number(previous.used || 0) : 0,
    windowStartedAtMs: active ? previous.windowStartedAtMs : now,
  };
}

async function consumeProviderBudget({
  admin,
  auth,
  action,
  units = 1,
  key,
  now = Date.now(),
}) {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const baseCost = PROVIDER_COSTS[action];
  if (!baseCost || !Number.isInteger(units) || units < 1) {
    throw new HttpsError('invalid-argument', 'Provider budget request is invalid.');
  }
  const cost = baseCost * units;
  if (cost > MINUTE_MAXIMUM) {
    throw new HttpsError(
      'resource-exhausted',
      'This request contains too many new places. Save a smaller section and try again.'
    );
  }

  // Version the persisted bucket whenever accounting weights change. Otherwise
  // usage charged under an older, heavier scheme can block users for a day.
  const id = `${providerPrincipal(auth.uid, key)}_v${PROVIDER_BUDGET_VERSION}`;
  const minuteRef = admin.firestore().doc(`system/runtime/providerRateLimits/${id}_minute`);
  const dayRef = admin.firestore().doc(`system/runtime/providerRateLimits/${id}_day`);
  await admin.firestore().runTransaction(async (transaction) => {
    const [minuteSnapshot, daySnapshot] = await Promise.all([
      transaction.get(minuteRef),
      transaction.get(dayRef),
    ]);
    const minute = bucketState(minuteSnapshot.data() || {}, now, MINUTE_WINDOW_MS);
    const day = bucketState(daySnapshot.data() || {}, now, DAY_WINDOW_MS);
    if (minute.used + cost > MINUTE_MAXIMUM) {
      throw new HttpsError('resource-exhausted', 'Google request limit reached. Please try again shortly.');
    }
    if (day.used + cost > DAY_MAXIMUM) {
      throw new HttpsError('resource-exhausted', 'Daily Google request limit reached. Please try again tomorrow.');
    }
    const updatedAt = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(minuteRef, {
      scope: 'minute',
      used: minute.used + cost,
      windowStartedAtMs: minute.windowStartedAtMs,
      expireAt: new Date(now + 10 * MINUTE_WINDOW_MS),
      updatedAt,
    });
    transaction.set(dayRef, {
      scope: 'day',
      used: day.used + cost,
      windowStartedAtMs: day.windowStartedAtMs,
      expireAt: new Date(now + 2 * DAY_WINDOW_MS),
      updatedAt,
    });
  });
}

module.exports = {
  DAY_MAXIMUM,
  DAY_WINDOW_MS,
  MINUTE_MAXIMUM,
  MINUTE_WINDOW_MS,
  PROVIDER_BUDGET_VERSION,
  PROVIDER_COSTS,
  PROVIDER_CALLABLE_LIMITS,
  PROVIDER_ROUTE_CALLABLE_LIMITS,
  bucketState,
  consumeProviderBudget,
  providerPrincipal,
};
