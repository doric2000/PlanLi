const mockHttpsCallable = jest.fn();
const mockStorage = { get: jest.fn(), set: jest.fn(), clear: jest.fn() };
const mockAuth = { currentUser: null };
const mockRandomUUID = jest.fn(() => '12345678-1234-1234-1234-1234567890ab');

jest.mock('firebase/functions', () => ({ httpsCallable: (...args) => mockHttpsCallable(...args) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));
jest.mock('../src/config/firebase', () => ({ auth: mockAuth, cloudFunctions: { name: 'functions' } }));
jest.mock('../src/services/guestSessionStorage', () => ({ guestSessionStorage: mockStorage }));

const { callPublicCallable, __publicCallableTesting } = require('../src/services/PublicCallableService');

const TOKEN = `v1.${'a'.repeat(32)}.${'b'.repeat(43)}`;

beforeEach(async () => {
  mockHttpsCallable.mockReset();
  mockStorage.get.mockReset().mockResolvedValue(null);
  mockStorage.set.mockReset().mockResolvedValue(undefined);
  mockStorage.clear.mockReset().mockResolvedValue(undefined);
  mockRandomUUID.mockClear();
  mockAuth.currentUser = null;
  await __publicCallableTesting.clearGuestSession();
  mockStorage.clear.mockClear();
});

test('guest public calls issue one limited-use session and attach a fresh nonce', async () => {
  const target = jest.fn(async (data) => ({ data: { echoed: data } }));
  const issue = jest.fn(async () => ({
    data: { guestSessionToken: TOKEN, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  }));
  mockHttpsCallable.mockImplementation((functions, name, options) => {
    expect(functions).toEqual({ name: 'functions' });
    if (name === 'issueGuestSession') {
      expect(options).toEqual({ limitedUseAppCheckTokens: true });
      return issue;
    }
    expect(options).toEqual({});
    expect(options).not.toHaveProperty('limitedUseAppCheckTokens');
    return target;
  });

  const result = await callPublicCallable('searchDestinations', { query: 'חיפה' });
  expect(issue).toHaveBeenCalledWith({});
  expect(target).toHaveBeenCalledWith({
    query: 'חיפה',
    _security: { guestSessionToken: TOKEN, nonce: '123456781234123412341234567890ab' },
  });
  expect(result.echoed.query).toBe('חיפה');
  expect(mockStorage.set).toHaveBeenCalledTimes(1);
});

test('authenticated public calls use the UID budget and never issue a guest token', async () => {
  mockAuth.currentUser = { uid: 'user-1' };
  const target = jest.fn(async (data) => ({ data: data }));
  mockHttpsCallable.mockReturnValue(target);
  await expect(callPublicCallable('loadRouteDetails', { routeId: 'route-1' }))
    .resolves.toEqual({ routeId: 'route-1' });
  expect(target).toHaveBeenCalledWith({ routeId: 'route-1' });
  expect(mockHttpsCallable).toHaveBeenCalledTimes(1);
});

test('stored sessions fail closed when malformed or within the refresh skew', () => {
  expect(__publicCallableTesting.validateStoredSession('{"guestSessionToken":"bad"}')).toBeNull();
  expect(__publicCallableTesting.validateStoredSession({
    guestSessionToken: TOKEN,
    expiresAt: new Date(Date.now() + 10_000).toISOString(),
  })).toBeNull();
});
