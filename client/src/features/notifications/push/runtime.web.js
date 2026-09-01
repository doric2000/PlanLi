import { createNotificationPushCallableClient } from './callables';
import {
  normalizePushPreferences,
  sanitizePushPreferencePatch,
} from './preferences';
import { PUSH_RESULT_REASONS } from './constants';

export function createNotificationPushRuntime({
  callables = createNotificationPushCallableClient(),
} = {}) {
  const setPreferences = async (preferences) => {
    const patch = sanitizePushPreferencePatch(preferences);
    if (patch.pushEnabled === true) {
      const error = new Error('Native push notifications are unavailable on Web.');
      error.code = 'push/unsupported';
      error.details = { reason: PUSH_RESULT_REASONS.UNSUPPORTED };
      throw error;
    }
    return normalizePushPreferences(await callables.setPreferences(patch));
  };
  return Object.freeze({
    isSupported: false,
    start: async () => ({ status: 'unsupported', reason: PUSH_RESULT_REASONS.UNSUPPORTED }),
    stop: () => {},
    enablePush: async () => ({ status: 'unsupported', reason: PUSH_RESULT_REASONS.UNSUPPORTED }),
    disablePush: async () => {
      const preferences = await callables.setPreferences({ pushEnabled: false });
      return { status: 'disabled', preferences: normalizePushPreferences(preferences) };
    },
    requestInitialPermission: async () => ({
      status: 'unsupported',
      reason: PUSH_RESULT_REASONS.UNSUPPORTED,
    }),
    registerForPushNotifications: async () => ({
      status: 'unsupported',
      reason: PUSH_RESULT_REASONS.UNSUPPORTED,
    }),
    handlePushTokenRollover: async () => ({
      status: 'unsupported',
      reason: PUSH_RESULT_REASONS.UNSUPPORTED,
    }),
    unregisterCurrentDevice: async () => ({ status: 'not_registered' }),
    getPreferences: () => callables.getPreferences(),
    setPreferences,
    handleResponse: async () => false,
    flushPendingResponse: async () => false,
  });
}
