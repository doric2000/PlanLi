let runtimeInstance = null;
let intentHandler = async () => false;
let errorHandler = () => {};

export function getNotificationPushRuntime() {
  if (!runtimeInstance) {
    // Platform resolution selects runtime.native.js or runtime.web.js. Keep the
    // native modules lazy so injected settings tests and Web never initialize
    // an unavailable native storage/notification binding.
    const { createNotificationPushRuntime } = require('./runtime');
    runtimeInstance = createNotificationPushRuntime({
      onNotificationIntent: (intent) => intentHandler(intent),
      onError: (details) => errorHandler(details),
    });
  }
  return runtimeInstance;
}

export function setNotificationPushRuntimeHandlers({ onIntent, onError } = {}) {
  intentHandler = typeof onIntent === 'function' ? onIntent : async () => false;
  errorHandler = typeof onError === 'function' ? onError : () => {};
  return () => {
    intentHandler = async () => false;
    errorHandler = () => {};
  };
}

export function __resetNotificationPushRuntimeForTests() {
  runtimeInstance?.stop?.();
  runtimeInstance = null;
  intentHandler = async () => false;
  errorHandler = () => {};
}
