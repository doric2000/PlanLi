let unregisterHandler = null;
export const SIGN_OUT_NOTIFICATION_CLEANUP_TIMEOUT_MS = 1500;

export function setNotificationDeviceUnregisterHandler(handler) {
  unregisterHandler = typeof handler === 'function' ? handler : null;
  return () => {
    if (unregisterHandler === handler) unregisterHandler = null;
  };
}

export async function unregisterNotificationDeviceBeforeSignOut({
  timeoutMs = SIGN_OUT_NOTIFICATION_CLEANUP_TIMEOUT_MS,
} = {}) {
  if (!unregisterHandler) return false;
  let timer = null;
  const cleanup = Promise.resolve()
    .then(() => unregisterHandler?.())
    .then(() => true, () => false);
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, Number(timeoutMs) || 0));
  });
  const result = await Promise.race([cleanup, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}
