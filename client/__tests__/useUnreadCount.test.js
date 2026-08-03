import { renderHook } from '@testing-library/react-native';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useUnreadCount } from '../src/features/notifications/hooks/useUnreadCount';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ kind: 'notifications' })),
  limit: jest.fn((value) => ({ kind: 'limit', value })),
  onSnapshot: jest.fn(() => jest.fn()),
  query: jest.fn((...constraints) => ({ kind: 'query', constraints })),
  where: jest.fn((...args) => ({ kind: 'where', args })),
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'owner' } },
  db: { kind: 'db' },
}));

describe('useUnreadCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the bounded notification query required by Firestore rules', () => {
    const unsubscribe = jest.fn();
    onSnapshot.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useUnreadCount());

    expect(collection).toHaveBeenCalledWith(
      { kind: 'db' },
      'users',
      'owner',
      'notifications'
    );
    expect(where).toHaveBeenCalledWith('isRead', '==', false);
    expect(limit).toHaveBeenCalledWith(50);
    expect(query).toHaveBeenCalledWith(
      { kind: 'notifications' },
      { kind: 'where', args: ['isRead', '==', false] },
      { kind: 'limit', value: 50 }
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
