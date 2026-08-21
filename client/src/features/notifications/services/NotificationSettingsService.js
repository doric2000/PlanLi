import { normalizePushPreferences, PUSH_PREFERENCE_FIELDS } from '../push/preferences';
import { getNotificationPushRuntime } from '../push/runtimeManager';

function getDefaultRuntime() {
  return getNotificationPushRuntime();
}

function preferenceError(result) {
  const error = new Error('Notification preference update was not completed.');
  error.code = `push/${String(result?.reason || result?.status || 'unknown').toLowerCase()}`;
  error.reason = result?.reason || result?.status || 'unknown';
  return error;
}

function categoryPatch(preferences) {
  return PUSH_PREFERENCE_FIELDS.reduce((patch, field) => {
    if (field !== 'pushEnabled') patch[field] = preferences[field];
    return patch;
  }, {});
}

export async function loadNotificationPushPreferences(runtime = getDefaultRuntime()) {
  return normalizePushPreferences(await runtime.getPreferences());
}

/**
 * Push opt-in/out is device-aware. Category-only edits can use the preference
 * callable, while a global transition must also register/unregister this device.
 */
export async function saveNotificationPushPreferences(
  nextValue,
  previousValue,
  runtime = getDefaultRuntime()
) {
  const previous = normalizePushPreferences(previousValue);
  const next = normalizePushPreferences(nextValue, previous);

  if (!previous.pushEnabled && next.pushEnabled) {
    const result = await runtime.enablePush();
    if (result?.status !== 'enabled') throw preferenceError(result);
    try {
      return normalizePushPreferences(await runtime.setPreferences(categoryPatch(next)), next);
    } catch (error) {
      await runtime.disablePush().catch(() => {});
      throw error;
    }
  }

  if (previous.pushEnabled && !next.pushEnabled) {
    const result = await runtime.disablePush();
    if (result?.status !== 'disabled') throw preferenceError(result);
    return normalizePushPreferences(await runtime.setPreferences(categoryPatch(next)), next);
  }

  return normalizePushPreferences(await runtime.setPreferences(categoryPatch(next)), next);
}
