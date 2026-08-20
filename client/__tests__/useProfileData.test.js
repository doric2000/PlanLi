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
const mockOrderBy = jest.fn((...parts) => ({ parts }));

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getCountFromServer: (...args) => mockGetCountFromServer(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  limit: (...args) => mockLimit(...args),
  orderBy: (...args) => mockOrderBy(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
}));

jest.mock('../src/config/firebase', () => ({
  db: { id: 'mock-db' },
  auth: { currentUser: { uid: 'profile-1' } },
}));

import { clearUserDataCache } from '../src/hooks/useUserData';
import { useProfileContent } from '../src/features/profile/hooks/useProfileContent';
import { useProfileData } from '../src/features/profile/hooks/useProfileData';
import { invalidateProfileResource } from '../src/features/profile/services/ProfileResourceService';

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
    invalidateProfileResource();
    jest.clearAllMocks();
  });

  it('uses the live owner identity and shares recommendation content with derived stats', async () => {
    const tripsRequest = deferred();
    const recommendationsRequest = deferred();
    const routesRequest = deferred();

    mockGetCountFromServer.mockReturnValue(tripsRequest.promise);
    mockGetDocs.mockImplementation((request) => (
      request.parts?.[0]?.collectionName === 'recommendations'
        ? recommendationsRequest.promise
        : routesRequest.promise
    ));

    const owner = {
      uid: 'profile-1',
      displayName: 'Auth Name',
      photoURL: 'https://example.com/auth.jpg',
      email: 'auth@example.com',
    };
    const { result } = renderHook(() => ({
      data: useProfileData({
        uid: 'profile-1',
        user: owner,
      }),
      content: useProfileContent({ uid: 'profile-1', user: owner, isOwnProfile: true }),
    }));

    await waitFor(() => {
      expect(mockGetDoc).not.toHaveBeenCalled();
      expect(mockGetCountFromServer).toHaveBeenCalledTimes(1);
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
    });

    expect(result.current.data.loading).toBe(false);
    expect(result.current.data.statsLoading).toBe(true);
    expect(result.current.data.userData).toEqual({
      displayName: 'Auth Name',
      photoURL: 'https://example.com/auth.jpg',
      photoMedia: null,
      email: 'auth@example.com',
      bio: '',
      isExpert: false,
      smartProfile: null,
    });

    act(() => {
      tripsRequest.resolve({
        data: () => ({ count: 4 }),
      });
      recommendationsRequest.resolve({
        docs: [
          { id: 'rec-1', data: () => ({ stats: { likeCount: 3 } }) },
          { id: 'rec-2', data: () => ({ stats: { likeCount: 4 } }) },
        ],
      });
      routesRequest.resolve({ docs: [{ id: 'route-1', data: () => ({}) }] });
    });

    await waitFor(() => {
      expect(result.current.data.statsLoading).toBe(false);
      expect(result.current.data.stats).toEqual({
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
      expect(result.current.content.recommendations.map((item) => item.id))
        .toEqual(['rec-1', 'rec-2']);
      expect(result.current.content.routes.map((item) => item.id)).toEqual(['route-1']);
    });
  });
});
