import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockGetCountFromServer = jest.fn();
const mockCollection = jest.fn((database, collectionName) => ({
  database,
  collectionName,
}));
const mockDoc = jest.fn((database, collectionName, uid) => ({
  database,
  collectionName,
  uid,
}));
const mockQuery = jest.fn((...parts) => ({ parts }));
const mockWhere = jest.fn((...parts) => ({ parts }));
const mockLimit = jest.fn((...parts) => ({ parts }));

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getCountFromServer: (...args) => mockGetCountFromServer(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  limit: (...args) => mockLimit(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
}));

jest.mock('../src/config/firebase', () => ({
  db: { id: 'mock-db' },
  auth: { currentUser: { uid: 'profile-1' } },
}));

import { clearUserDataCache } from '../src/hooks/useUserData';
import { useProfileData } from '../src/features/profile/hooks/useProfileData';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useProfileData loading', () => {
  beforeEach(() => {
    clearUserDataCache();
    jest.clearAllMocks();
  });

  it('reveals identity before stats finish and loads both stat sources concurrently', async () => {
    const identityRequest = deferred();
    const tripsRequest = deferred();
    const recommendationsRequest = deferred();

    mockGetDoc.mockReturnValue(identityRequest.promise);
    mockGetCountFromServer.mockReturnValue(tripsRequest.promise);
    mockGetDocs.mockReturnValue(recommendationsRequest.promise);

    const { result } = renderHook(() =>
      useProfileData({
        uid: 'profile-1',
        user: {
          uid: 'profile-1',
          displayName: 'Auth Name',
          photoURL: 'https://example.com/auth.jpg',
          email: 'auth@example.com',
        },
      })
    );

    await waitFor(() => {
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
      expect(mockGetCountFromServer).toHaveBeenCalledTimes(1);
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.statsLoading).toBe(true);

    act(() => {
      identityRequest.resolve({
        exists: () => true,
        data: () => ({
          displayName: 'Firestore Name',
          photoURL: 'https://example.com/firestore.jpg',
          email: 'firestore@example.com',
          isExpert: true,
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.userData).toEqual({
      displayName: 'Firestore Name',
      photoURL: 'https://example.com/firestore.jpg',
      photoMedia: null,
      email: 'firestore@example.com',
      bio: '',
      isExpert: true,
      smartProfile: null,
    });
    expect(result.current.statsLoading).toBe(true);
    expect(result.current.stats.routes).toBe(0);

    act(() => {
      tripsRequest.resolve({
        data: () => ({ count: 4 }),
      });
      recommendationsRequest.resolve({
        size: 2,
        forEach: (callback) => {
          callback({ data: () => ({ stats: { likeCount: 3 } }) });
          callback({ data: () => ({ stats: { likeCount: 4 } }) });
        },
      });
    });

    await waitFor(() => {
      expect(result.current.statsLoading).toBe(false);
      expect(result.current.stats).toEqual({
        routes: 4,
        recommendations: 2,
        likesReceived: 7,
        contributionScore: 34,
        standing: {
          id: 'starting',
          label: 'בתחילת הדרך',
          minimumScore: 0,
          color: '#64748B',
          icon: 'explore',
        },
        dominantCategory: null,
      });
    });
  });
});
