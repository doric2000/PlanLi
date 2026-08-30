const mockConfigure = jest.fn();
const mockInitializeNativeAppCheck = jest.fn();
const mockGetToken = jest.fn();
const mockGetLimitedUseToken = jest.fn();
const mockInitializeWebSdkAppCheck = jest.fn();
let bridgeProvider;

jest.mock('@react-native-firebase/app', () => ({
  getApp: () => ({ name: 'native-app' }),
}));

jest.mock('@react-native-firebase/app-check', () => ({
  ReactNativeFirebaseAppCheckProvider: jest.fn().mockImplementation(() => ({
    configure: mockConfigure,
  })),
  getToken: (...args) => mockGetToken(...args),
  getLimitedUseToken: (...args) => mockGetLimitedUseToken(...args),
  initializeAppCheck: (...args) => mockInitializeNativeAppCheck(...args),
}));

jest.mock('firebase/app-check', () => ({
  initializeAppCheck: (...args) => {
    bridgeProvider = args[1].provider;
    return mockInitializeWebSdkAppCheck(...args);
  },
}));

const { initializePlanLiAppCheck } = require('../src/config/appCheck.native');

test('native bridge keeps reusable and limited-use App Check tokens separate', async () => {
  const nativeAppCheck = { name: 'native-app-check' };
  const webAppCheck = { name: 'web-app-check' };
  const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature${'x'.repeat(100)}`;
  const limitedToken = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url')}.limited${'y'.repeat(100)}`;
  mockInitializeNativeAppCheck.mockResolvedValue(nativeAppCheck);
  mockInitializeWebSdkAppCheck.mockReturnValue(webAppCheck);
  mockGetToken.mockResolvedValue({ token });
  mockGetLimitedUseToken.mockResolvedValue({ token: limitedToken });

  expect(initializePlanLiAppCheck({ name: 'web-app' })).toBe(webAppCheck);
  expect(mockConfigure).toHaveBeenCalledWith({
    android: { provider: 'debug' },
    apple: { provider: 'debug' },
  });

  const bridged = await bridgeProvider.getToken(false);
  expect(mockGetToken).toHaveBeenCalledWith(nativeAppCheck, false);
  expect(bridged.token).toBe(token);
  expect(bridged.expireTimeMillis).toBeGreaterThan(Date.now());
  expect(bridged.issuedAtTimeMillis).toBeLessThanOrEqual(Date.now());

  const limited = await bridgeProvider.getToken(true);
  expect(mockGetLimitedUseToken).toHaveBeenCalledWith(nativeAppCheck);
  expect(limited.token).toBe(limitedToken);
  expect(mockGetToken).toHaveBeenCalledTimes(1);
});
