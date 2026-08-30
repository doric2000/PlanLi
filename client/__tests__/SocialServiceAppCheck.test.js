const mockHttpsCallable = jest.fn();

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: { name: 'functions' } }));

const {
  deleteContent,
  requestAccountDeletion,
  setFavorite,
} = require('../src/services/SocialService');

test('only server-consumed destructive callables request limited-use App Check tokens', async () => {
  mockHttpsCallable.mockImplementation((functions, name, options) => {
    expect(functions).toEqual({ name: 'functions' });
    if (['deleteContent', 'requestAccountDeletion'].includes(name)) {
      expect(options).toEqual({ limitedUseAppCheckTokens: true });
    } else {
      expect(options).toBeUndefined();
    }
    return jest.fn(async (payload) => ({ data: payload }));
  });

  await deleteContent({ type: 'route', id: 'route-1' });
  await requestAccountDeletion({ provider: 'password' });
  await setFavorite({ type: 'destination', id: 'dest-1' }, true);

  expect(mockHttpsCallable).toHaveBeenCalledTimes(3);
});
