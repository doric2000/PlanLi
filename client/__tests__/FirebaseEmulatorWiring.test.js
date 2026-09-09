
const mockCalls = [];
let mockLocal = true;
jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ initializeAuth: () => ({}), getReactNativePersistence: jest.fn(),
  connectAuthEmulator: (_sdk, host) => mockCalls.push(['auth', host]) }));
jest.mock('firebase/firestore', () => ({ getFirestore: () => ({}),
  initializeFirestore: (_app, settings) => { mockCalls.push(['localTransport', settings]); return {}; },
  connectFirestoreEmulator: (_sdk, host, port) => mockCalls.push(['firestore', host, port]) }));
jest.mock('firebase/storage', () => ({ getStorage: () => ({}),
  connectStorageEmulator: (_sdk, host, port) => mockCalls.push(['storage', host, port]) }));
jest.mock('firebase/functions', () => ({ getFunctions: () => ({}),
  connectFunctionsEmulator: (_sdk, host, port) => mockCalls.push(['functions', host, port]) }));
jest.mock('../src/config/appCheck', () => ({ initializePlanLiAppCheck: jest.fn() }));
jest.mock('../src/config/secureAuthStorage', () => ({ secureAuthStorage: {} }));
jest.mock('../src/config/firebaseEnvironment', () => ({ resolveFirebaseEnvironment: () => ({ projectId: 'demo-planli-e2e', storageBucket: 'demo-planli-e2e.appspot.com' }) }));
jest.mock('../src/config/localEmulators', () => ({ localEmulatorSettings: () => mockLocal ? { host: '127.0.0.1', auth: 9099, firestore: 8080, storage: 9199, functions: 5001 } : null }));

test('all four SDKs connect before consumers receive the exported instances', () => {
  jest.isolateModules(() => {
    const sdk = require('../src/config/firebase');
    expect(sdk.auth).toBeDefined();
    expect(sdk.cloudFunctions).toBeDefined();
    expect(mockCalls).toEqual([['localTransport', { experimentalForceLongPolling: true }], ['auth', 'http://127.0.0.1:9099'], ['firestore', '127.0.0.1', 8080],
      ['storage', '127.0.0.1', 9199], ['functions', '127.0.0.1', 5001]]);
  });
});
test('normal app initialization never connects any emulator', () => {
  mockCalls.length = 0;
  mockLocal = false;
  jest.isolateModules(() => require('../src/config/firebase'));
  expect(mockCalls).toEqual([]);
});
