import { renderHook } from '@testing-library/react-native';

import { useUnreadCount } from '../src/features/notifications/hooks/useUnreadCount';

const mockCenter = {
  unreadCounts: { personal: 4, admin: 2 },
  totalUnread: 6,
};

jest.mock('../src/features/notifications/context/NotificationCenterContext', () => ({
  useNotificationCenter: () => mockCenter,
}));

describe('useUnreadCount', () => {
  it('uses denormalized provider counters without reading a notification list', () => {
    expect(renderHook(() => useUnreadCount()).result.current).toBe(6);
    expect(renderHook(() => useUnreadCount('personal')).result.current).toBe(4);
    expect(renderHook(() => useUnreadCount('admin')).result.current).toBe(2);
  });
});
