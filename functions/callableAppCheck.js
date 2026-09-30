const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const EXPIRY_GRACE_MS = 5 * 60 * 1000;

// Run before normalization, authorization and business side effects. The SDK's
// consumption result alone did not provide monotonic rejection in live controls.
async function assertCallableAppCheckFresh(request, options, { admin, log = logger.warn, now = Date.now() } = {}) {
  if (options.consumeAppCheckToken !== true) return;
  const rejectReplay = () => {
    log('app_check_rejected', { reason: 'APP_CHECK_REPLAYED' });
    throw new HttpsError('permission-denied', 'This App Check token was already consumed.', {
      reason: 'APP_CHECK_REPLAYED',
    });
  };
  // Preserve the staged-off/local emulator contract, whose debug token has no jti.
  if (options.enforceAppCheck !== true) {
    if (request.app?.alreadyConsumed === true) rejectReplay();
    return;
  }
  const { appId, token, alreadyConsumed } = request.app || {};
  const validIdentity = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512;
  const expiresAtMs = token?.exp * 1000;
  if (!validIdentity(appId) || !validIdentity(token?.iss) || !validIdentity(token?.jti)
    || token.sub !== appId || typeof alreadyConsumed !== 'boolean'
    || !Number.isSafeInteger(token?.exp) || !Number.isSafeInteger(expiresAtMs)
    || expiresAtMs <= now || expiresAtMs + EXPIRY_GRACE_MS > 8640000000000000) {
    log('app_check_rejected', { reason: 'APP_CHECK_REQUIRED' });
    throw new HttpsError('unauthenticated', 'A verifiable App Check token is required.', {
      reason: 'APP_CHECK_REQUIRED',
    });
  }
  // One identity across users and endpoints; re-encoding a JWT cannot change it.
  const id = crypto.createHash('sha256').update(JSON.stringify([token.iss, appId, token.jti])).digest('hex');
  try {
    await admin.firestore().doc(`system/runtime/appCheckConsumedTokens/${id}`).create({
      expireAt: new Date(expiresAtMs + EXPIRY_GRACE_MS),
    });
  } catch (error) {
    if ([6, '6', 'already-exists'].includes(error?.code)) rejectReplay();
    log('app_check_rejected', { reason: 'APP_CHECK_VERIFICATION_UNAVAILABLE' });
    throw new HttpsError('unavailable', 'App Check verification is temporarily unavailable.', {
      reason: 'APP_CHECK_VERIFICATION_UNAVAILABLE',
    });
  }
  // Remember SDK-rejected tokens too: a later inconsistent false must stay denied.
  if (alreadyConsumed) rejectReplay();
}

module.exports = { assertCallableAppCheckFresh };
