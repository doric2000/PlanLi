const { HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

// The SDK consumes the token but deliberately leaves replay rejection to the
// handler. Run this before authorization, normalization or business side effects.
function assertCallableAppCheckFresh(request, options, log = logger.warn) {
  if (options.consumeAppCheckToken !== true || request.app?.alreadyConsumed !== true) return;
  log('app_check_rejected', { reason: 'APP_CHECK_REPLAYED' });
  throw new HttpsError('permission-denied', 'This App Check token was already consumed.', {
    reason: 'APP_CHECK_REPLAYED',
  });
}

module.exports = { assertCallableAppCheckFresh };
