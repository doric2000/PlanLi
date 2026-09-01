const mockHttpsCallable = jest.fn();
const mockCaptureDiagnosticException = jest.fn();
let callableFailure;

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: { name: 'functions' } }));
jest.mock('../src/services/ErrorReporting', () => ({
  captureDiagnosticException: (...args) => mockCaptureDiagnosticException(...args),
}));

const {
  deleteContent,
  requestAccountDeletion,
  setFavorite,
} = require('../src/services/SocialService');

beforeEach(() => {
  callableFailure = null;
  mockHttpsCallable.mockClear();
  mockCaptureDiagnosticException.mockClear();
  mockHttpsCallable.mockImplementation((functions, name, options) => {
    expect(functions).toEqual({ name: 'functions' });
    if (['deleteContent', 'requestAccountDeletion'].includes(name)) {
      expect(options).toEqual({ limitedUseAppCheckTokens: true });
    } else {
      expect(options).toBeUndefined();
    }
    return jest.fn(async (payload) => {
      if (callableFailure) throw callableFailure;
      return { data: payload };
    });
  });
});

test('only server-consumed destructive callables request limited-use App Check tokens', async () => {
  await deleteContent({ type: 'route', id: 'route-1' });
  await requestAccountDeletion({ provider: 'password' });
  await setFavorite({ type: 'destination', id: 'dest-1' }, true);

  expect(mockHttpsCallable).toHaveBeenCalledTimes(3);
});

test('content deletion reports bounded diagnostic metadata and preserves the original failure', async () => {
  const failure = Object.assign(new Error('App Check token unavailable'), {
    code: 'appCheck/token-error',
  });
  callableFailure = failure;

  await expect(deleteContent({ type: 'recommendation', id: 'recommendation-1' }))
    .rejects.toBe(failure);
  expect(mockCaptureDiagnosticException).toHaveBeenCalledWith(failure, {
    operation: 'delete_content',
    code: 'appCheck/token-error',
    reason: 'delete_failed',
    contentType: 'recommendation',
  });
});
