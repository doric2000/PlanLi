'use strict';

// This is the entrypoint of a generated, ignored Emulator Suite codebase only.
// Production deployment keeps functions/index.js as its entrypoint.
const { createRequire } = require('node:module');
const path = require('node:path');
const { ROOT, PROJECT, BUCKET, assertLocalEnvironment } = require('./environment');
assertLocalEnvironment(process.env, { emulatorService: true });
if (process.env.FUNCTIONS_EMULATOR !== 'true') throw new Error('This bootstrap requires the Functions emulator.');

const fromFunctions = createRequire(path.join(ROOT, 'functions/package.json'));
const adminPath = fromFunctions.resolve('firebase-admin');
const admin = fromFunctions('firebase-admin');
// The Firebase CLI's namespace proxy drops Firestore static helpers (FieldValue, Timestamp).
// Use the real modular SDK for this namespace; the same emulator host still applies.
const firestoreSdk = fromFunctions('firebase-admin/firestore');
const localFirestore = Object.assign((...args) => firestoreSdk.getFirestore(...args), firestoreSdk);
const localAdmin = new Proxy(admin, {
  get(target, property) {
    if (property === 'firestore') return localFirestore;
    if (property === 'initializeApp') return (options) => target.initializeApp({ ...options, projectId: PROJECT, storageBucket: BUCKET });
    return Reflect.get(target, property);
  },
});
require.cache[adminPath].exports = localAdmin;

// Keep real auth, normalization, rate limits, service logic and storage processing.
// Only the external attestation and provider transports are replaced locally.
const oauth = fromFunctions('./googleMapsOAuth');
oauth.getGoogleMapsAccessToken = async () => 'local-provider-fixture';
const nativeFetch = global.fetch;
global.fetch = async (input, options) => {
  const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return nativeFetch(input, options);
  const reply = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  const city = {
    id: 'local-london', displayName: { text: 'לונדון' }, formattedAddress: 'London, United Kingdom',
    location: { latitude: 51.5074, longitude: -0.1278 }, types: ['locality', 'political'],
    viewport: { low: { latitude: 51.28, longitude: -0.51 }, high: { latitude: 51.69, longitude: 0.33 } },
    addressComponents: [
      { longText: 'London', shortText: 'London', types: ['locality', 'political'] },
      { longText: 'United Kingdom', shortText: 'GB', types: ['country', 'political'] },
    ],
  };
  if (url.hostname === 'places.googleapis.com') {
    if (url.pathname.endsWith(':autocomplete')) return reply({ suggestions: [{ placePrediction: {
      placeId: city.id, text: { text: 'לונדון, בריטניה' },
      structuredFormat: { mainText: { text: 'לונדון' }, secondaryText: { text: 'בריטניה' } }, types: city.types,
    } }] });
    if (url.pathname.endsWith(':searchText')) return reply({ places: [city] });
    if (url.pathname === '/v1/places/local-london') return reply(city);
  }
  throw new Error(`External request blocked by local E2E harness: ${url.hostname}`);
};
for (const moduleName of ['node:http', 'node:https']) {
  const transport = require(moduleName);
  const request = transport.request;
  transport.request = function (...args) {
    const value = args[0];
    const host = typeof value === 'string' || value instanceof URL ? new URL(value).hostname : value?.hostname || value?.host;
    if (host && !/^(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?$/.test(host)) {
      throw new Error(`External transport blocked by local E2E harness: ${host}`);
    }
    return request.apply(this, args);
  };
}

module.exports = fromFunctions('./index');
