// Shared with the local test runner. No live Firebase project uses this configuration.
const LOCAL_PROJECT_ID = 'demo-planli-e2e';
const LOCAL_APP_CHECK_TOKEN = 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDAsImlhdCI6MSwiYXBwX2lkIjoiZGVtby1wbGFubGktZTJlIiwic3ViIjoiZGVtby1wbGFubGktZTJlIn0.local';

function resolveLocalEmulators({ enabled, development, projectId, host = '127.0.0.1' }) {
  if (enabled !== 'true') {
    if (projectId === LOCAL_PROJECT_ID) throw new Error('The demo project requires explicit local emulator mode.');
    return null;
  }
  if (!development || projectId !== LOCAL_PROJECT_ID) throw new Error('Local emulators require a development app and demo-planli-e2e.');
  if (!['127.0.0.1', '10.0.2.2', 'localhost'].includes(host)) throw new Error('Emulators must use a local host.');
  return { projectId, host, auth: 9099, firestore: 8080, storage: 9199, functions: 5001 };
}

function localEmulatorSettings() {
  return resolveLocalEmulators({
    enabled: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS,
    development: typeof __DEV__ !== 'undefined' && __DEV__,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    host: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1',
  });
}

function localMediaUrl(value) {
  const settings = localEmulatorSettings();
  if (!settings || typeof value !== 'string') return value;
  const prefix = `https://firebasestorage.googleapis.com/v0/b/${LOCAL_PROJECT_ID}.appspot.com/`;
  return value.startsWith(prefix) ? value.replace('https://firebasestorage.googleapis.com', `http://${settings.host}:${settings.storage}`) : value;
}

function localAppCheckProvider() {
  return {
    async getToken() {
      return { token: LOCAL_APP_CHECK_TOKEN, expireTimeMillis: Date.now() + 3600000, issuedAtTimeMillis: Date.now() };
    },
    initialize() {},
    isEqual(other) { return other === this; },
  };
}

module.exports = { LOCAL_PROJECT_ID, LOCAL_APP_CHECK_TOKEN, resolveLocalEmulators, localEmulatorSettings, localMediaUrl, localAppCheckProvider };
