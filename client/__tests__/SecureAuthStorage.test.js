const mockSecureValues = new Map();
const mockLegacyValues = new Map();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(async (key) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => { mockSecureValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key) => { mockSecureValues.delete(key); }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key) => mockLegacyValues.get(key) ?? null),
  setItem: jest.fn(async (key, value) => { mockLegacyValues.set(key, value); }),
  removeItem: jest.fn(async (key) => { mockLegacyValues.delete(key); }),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async (algorithm, value) => `hash${String(value).length}`),
  randomUUID: jest.fn(() => '12345678-1234-1234-1234-1234567890ab'),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const SecureStore = require('expo-secure-store');
const { secureAuthStorage } = require('../src/config/secureAuthStorage.native');

beforeEach(() => {
  mockSecureValues.clear();
  mockLegacyValues.clear();
  jest.clearAllMocks();
});

test('legacy Firebase Auth state migrates to device-only SecureStore and is removed from AsyncStorage', async () => {
  const key = 'firebase:authUser:test';
  const value = JSON.stringify({ stsTokenManager: { refreshToken: 'sensitive-refresh-token' } });
  mockLegacyValues.set(key, value);
  await expect(secureAuthStorage.getItem(key)).resolves.toBe(value);
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(key);
  expect(mockLegacyValues.has(key)).toBe(false);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    expect.stringMatching(/^planli\.auth\./),
    expect.any(String),
    { keychainAccessible: 'device-only' }
  );
  AsyncStorage.getItem.mockClear();
  await expect(secureAuthStorage.getItem(key)).resolves.toBe(value);
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
});

test('large auth state is chunked and reconstructed without writing secrets to AsyncStorage', async () => {
  const value = 'x'.repeat(5000);
  await secureAuthStorage.setItem('firebase:authUser:large', value);
  await expect(secureAuthStorage.getItem('firebase:authUser:large')).resolves.toBe(value);
  const chunkWrites = SecureStore.setItemAsync.mock.calls.filter(([key]) => !key.endsWith('.meta'));
  expect(chunkWrites).toHaveLength(3);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
