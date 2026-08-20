import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockOnSnapshot = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...parts) => ({ parts })),
  limit: jest.fn((value) => ({ type: 'limit', value })),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  orderBy: jest.fn((...parts) => ({ type: 'orderBy', parts })),
  query: jest.fn((...parts) => ({ parts })),
  where: jest.fn((...parts) => ({ type: 'where', parts })),
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'traveler-1' } },
  db: { id: 'mock-db' },
}));

jest.mock('../src/hooks/useUserData', () => ({
  primeUserDataCache: jest.fn(),
}));

import { useFavorites } from '../src/hooks/useFavorites';
import { auth as firebaseAuth } from '../src/config/firebase';

const serverSnapshot = (ids) => ({
  docs: ids.map((id) => ({
    id: `favorite-${id}`,
    data: () => ({ type: 'recommendation', target: { type: 'recommendation', id } }),
  })),
  metadata: { fromCache: false },
});

describe('useFavorites retained realtime listener', () => {
  let nextSnapshot;
  let failSnapshot;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    firebaseAuth.currentUser = { uid: 'traveler-1' };
    mockOnSnapshot.mockImplementation((_query, _options, next, fail) => {
      nextSnapshot = next;
      failSnapshot = fail;
      return jest.fn();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes lazily once, applies live changes, and makes no query on a healthy pull', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useFavorites('recommendation', { enabled }),
      { initialProps: { enabled: false } }
    );
    expect(mockOnSnapshot).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    act(() => nextSnapshot(serverSnapshot(['rec-1'])));
    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(result.current.favorites.map((item) => item.id)).toEqual(['rec-1']);

    const pull = result.current.reload();
    expect(pull).toMatchObject({ requested: false, source: 'live' });
    await pull.promise;
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);

    act(() => nextSnapshot(serverSnapshot(['rec-2'])));
    expect(result.current.favorites.map((item) => item.id)).toEqual(['rec-2']);
  });

  it('preserves cached rows after listener failure and reconnects under retry control', async () => {
    const { result } = renderHook(() => useFavorites('recommendation'));
    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    act(() => nextSnapshot(serverSnapshot(['rec-1'])));
    await waitFor(() => expect(result.current.status).toBe('live'));

    const error = new Error('listener unavailable');
    act(() => failSnapshot(error));
    expect(result.current.status).toBe('error');
    expect(result.current.favorites.map((item) => item.id)).toEqual(['rec-1']);

    let retry;
    act(() => {
      retry = result.current.reload();
    });
    expect(retry).toMatchObject({ requested: true, source: 'network' });
    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(2));
    act(() => nextSnapshot(serverSnapshot(['rec-1', 'rec-2'])));
    await expect(retry.promise).resolves.toBeUndefined();
    expect(result.current.favorites.map((item) => item.id)).toEqual(['rec-1', 'rec-2']);
  });

  it('does not expose a previous account\'s cached favorites', async () => {
    const { result, rerender } = renderHook(() => useFavorites('recommendation'));
    await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalledTimes(1));
    act(() => nextSnapshot(serverSnapshot(['private-rec'])));
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));

    firebaseAuth.currentUser = { uid: 'traveler-2' };
    rerender();
    expect(result.current.favorites).toEqual([]);
  });
});
