import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetDoc = jest.fn();
const mockDoc = jest.fn((database, collectionName, userId) => ({
  database,
  collectionName,
  userId,
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
}));

jest.mock('../src/config/firebase', () => ({
  db: { id: 'mock-db' },
  auth: { currentUser: null },
}));

import { auth } from '../src/config/firebase';
import {
  clearUserDataCache,
  primeUserDataCache,
  useUserData,
} from '../src/hooks/useUserData';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useUserData author cache', () => {
  beforeEach(() => {
    clearUserDataCache();
    auth.currentUser = null;
    jest.clearAllMocks();
  });

  it('deduplicates concurrent Firestore reads and reuses the cached result', async () => {
    const request = deferred();
    mockGetDoc.mockReturnValue(request.promise);

    const firstRender = renderHook(() => ({
      first: useUserData('author-1'),
      second: useUserData('author-1'),
    }));

    await waitFor(() => {
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      request.resolve({
        exists: () => true,
        data: () => ({
          displayName: 'Fast Author',
          photoURL: 'https://example.com/avatar.jpg',
        }),
      });
      await request.promise;
    });

    await waitFor(() => {
      expect(firstRender.result.current.first).toEqual({
        displayName: 'Fast Author',
        photoURL: 'https://example.com/avatar.jpg',
        photoMedia: null,
        loading: false,
      });
      expect(firstRender.result.current.second).toEqual(
        firstRender.result.current.first
      );
    });

    firstRender.unmount();

    const cachedRender = renderHook(() => useUserData('author-1'));
    expect(cachedRender.result.current).toEqual({
      displayName: 'Fast Author',
      photoURL: 'https://example.com/avatar.jpg',
      photoMedia: null,
      loading: false,
    });
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('serves the signed-in user immediately without a Firestore read', () => {
    auth.currentUser = {
      uid: 'current-user',
      displayName: 'Current Traveler',
      photoURL: 'https://example.com/current.jpg',
    };

    const { result } = renderHook(() => useUserData('current-user'));

    expect(result.current).toEqual({
      displayName: 'Current Traveler',
      photoURL: 'https://example.com/current.jpg',
      photoMedia: null,
      loading: false,
    });
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('falls back to legacy users while production rules are being rolled out', async () => {
    mockGetDoc
      .mockRejectedValueOnce({ code: 'permission-denied' })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          displayName: 'Bot',
          photoURL: 'https://example.com/bot.jpg',
        }),
      });

    const { result } = renderHook(() => useUserData('bot-user'));

    await waitFor(() => {
      expect(result.current).toEqual({
        displayName: 'Bot',
        photoURL: 'https://example.com/bot.jpg',
        photoMedia: null,
        loading: false,
      });
    });

    expect(mockDoc).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'publicProfiles',
      'bot-user'
    );
    expect(mockDoc).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'users',
      'bot-user'
    );
  });

  it('allows a new profile photo to prime and update mounted consumers', async () => {
    primeUserDataCache('author-2', {
      displayName: 'Cached Traveler',
      photoURL: 'https://example.com/old.jpg',
    });

    const { result } = renderHook(() => useUserData('author-2'));
    expect(result.current.photoURL).toBe('https://example.com/old.jpg');

    act(() => {
      primeUserDataCache('author-2', {
        photoURL: 'https://example.com/new.jpg',
      });
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        displayName: 'Cached Traveler',
        photoURL: 'https://example.com/new.jpg',
        photoMedia: null,
        loading: false,
      });
    });
    expect(mockGetDoc).not.toHaveBeenCalled();
  });
});
