import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  NotificationCenterProvider,
  notificationAfterBlockFilter,
  useNotificationCenter,
} from '../src/features/notifications/context/NotificationCenterContext';

let mockUser = { uid: 'owner' };
let mockIsAdmin = false;
let mockAdminLoading = false;
let mockPageListeners;
let mockStateListener;
let mockBlockedIds = new Set();
let mockIsBlocked = (uid) => mockBlockedIds.has(uid);

jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ user: mockUser }) }));
jest.mock('../src/hooks/useAdminClaim', () => ({
  useAdminClaim: () => ({ isAdmin: mockIsAdmin, loading: mockAdminLoading }),
}));
jest.mock('../src/features/moderation/BlockedUsersContext', () => ({
  useBlockedUsers: () => ({ isBlocked: mockIsBlocked }),
}));
jest.mock('../src/features/notifications/services/NotificationService', () => ({
  clearNotificationChannel: jest.fn(() => Promise.resolve({ deleted: 1 })),
  deleteNotificationById: jest.fn(() => Promise.resolve({ deleted: true })),
  getNotificationById: jest.fn(() => Promise.resolve(null)),
  getNotificationPage: jest.fn(() => Promise.resolve({ items: [], cursor: null, hasMore: false })),
  getNotificationState: jest.fn(() => Promise.resolve({ personalUnread: 0, adminUnread: 0 })),
  markNotificationChannelRead: jest.fn(() => Promise.resolve({ updated: 1 })),
  setNotificationRead: jest.fn(() => Promise.resolve({ changed: true })),
  subscribeToNotificationPage: jest.fn(),
  subscribeToNotificationState: jest.fn(),
}));

import * as mockNotificationService from '../src/features/notifications/services/NotificationService';

const wrapper = ({ children }) => (
  <NotificationCenterProvider>{children}</NotificationCenterProvider>
);

const unread = {
  id: 'notification-1',
  schemaVersion: 2,
  channel: 'personal',
  type: 'system',
  isRead: false,
  createdAt: new Date('2026-08-21T09:00:00Z'),
  target: { thumbUrls: [] },
  navigation: { action: 'open_recommendation', recommendationId: 'post-1' },
};

describe('NotificationCenterProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { uid: 'owner' };
    mockIsAdmin = false;
    mockAdminLoading = false;
    mockBlockedIds = new Set();
    mockIsBlocked = (uid) => mockBlockedIds.has(uid);
    mockPageListeners = {};
    mockStateListener = null;
    mockNotificationService.subscribeToNotificationPage.mockImplementation(
      (_uid, channel, onPage, _onError, options = {}) => {
        mockPageListeners[channel] = onPage;
        mockPageListeners[`${channel}:${options.filter || 'all'}`] = onPage;
        return jest.fn();
      }
    );
    mockNotificationService.subscribeToNotificationState.mockImplementation((_uid, onState) => {
      mockStateListener = onState;
      return jest.fn();
    });
    mockNotificationService.clearNotificationChannel.mockResolvedValue({ deleted: 1 });
    mockNotificationService.deleteNotificationById.mockResolvedValue({ deleted: true });
    mockNotificationService.getNotificationState.mockResolvedValue({
      personalUnread: 0,
      adminUnread: 0,
    });
    mockNotificationService.markNotificationChannelRead.mockResolvedValue({ updated: 1 });
    mockNotificationService.setNotificationRead.mockResolvedValue({ changed: true });
  });

  it('subscribes to personal data and only opens the admin stream after claim verification', async () => {
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());
    expect(mockPageListeners.admin).toBeUndefined();
    expect(mockNotificationService.subscribeToNotificationPage)
      .toHaveBeenCalledWith('owner', 'personal', expect.any(Function), expect.any(Function), { filter: 'all' });

    mockIsAdmin = true;
    hook.rerender({});
    await waitFor(() => expect(mockPageListeners.admin).toBeTruthy());
    expect(hook.result.current.isAdmin).toBe(true);
  });

  it('switches to an indexed server-filtered stream and ignores the retired filter callback', async () => {
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners['personal:all']).toBeTruthy());
    const retiredAllListener = mockPageListeners['personal:all'];

    act(() => hook.result.current.setActiveFilter('personal', 'likes'));
    await waitFor(() => expect(mockPageListeners['personal:likes']).toBeTruthy());
    expect(hook.result.current.activeFilters.personal).toBe('likes');
    expect(hook.result.current.channels.personal.items).toEqual([]);
    expect(hook.result.current.channels.personal.loading).toBe(true);

    act(() => retiredAllListener({ items: [unread], cursor: null, hasMore: false }));
    expect(hook.result.current.channels.personal.items).toEqual([]);

    const like = { ...unread, id: 'older-like', type: 'like' };
    act(() => mockPageListeners['personal:likes']({ items: [like], cursor: null, hasMore: false }));
    expect(hook.result.current.channels.personal.items).toEqual([like]);
  });

  it('deduplicates an in-flight row mutation and settles the optimistic read state', async () => {
    let finishRead;
    mockNotificationService.setNotificationRead.mockReturnValue(new Promise((resolve) => {
      finishRead = resolve;
    }));
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());

    act(() => {
      mockPageListeners.personal({ items: [unread], cursor: null, hasMore: false });
      mockStateListener({ personalUnread: 1, adminUnread: 0 });
    });

    let first;
    let second;
    act(() => {
      first = hook.result.current.setRead(unread, true);
      second = hook.result.current.setRead(unread, true);
    });
    await waitFor(() => expect(mockNotificationService.setNotificationRead).toHaveBeenCalledTimes(1));
    expect(first).toBe(second);
    expect(hook.result.current.channels.personal.items[0].isRead).toBe(true);
    expect(hook.result.current.pendingActions['item:notification-1']).toBe(true);

    await act(async () => {
      finishRead({ changed: true });
      await first;
    });
    expect(hook.result.current.pendingActions['item:notification-1']).toBe(false);
  });

  it('ignores a stale head callback after the signed-in user changes', async () => {
    const listenersByUser = {};
    mockNotificationService.subscribeToNotificationPage.mockImplementation(
      (uid, channel, onPage) => {
        listenersByUser[`${uid}:${channel}`] = onPage;
        return jest.fn();
      }
    );
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(listenersByUser['owner:personal']).toBeTruthy());

    mockUser = { uid: 'next-owner' };
    hook.rerender({});
    await waitFor(() => expect(listenersByUser['next-owner:personal']).toBeTruthy());
    act(() => listenersByUser['owner:personal']({ items: [unread], cursor: null, hasMore: false }));

    expect(hook.result.current.channels.personal.items).toEqual([]);
  });

  it('rejects admin push ids before a privileged direct read and rejects legacy rows', async () => {
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await expect(hook.result.current.resolveNotification('admin-id', 'admin')).resolves.toBeNull();
    expect(mockNotificationService.getNotificationById).not.toHaveBeenCalled();

    mockNotificationService.getNotificationById.mockResolvedValue({
      ...unread,
      id: 'legacy-id',
      schemaVersion: 1,
    });
    await expect(hook.result.current.resolveNotification('legacy-id', 'personal')).resolves.toBeNull();
  });

  it('uses the stored cursor for pagination and appends a page once', async () => {
    const cursor = { id: 'cursor-1' };
    const older = { ...unread, id: 'notification-older', createdAt: new Date('2026-08-20') };
    mockNotificationService.getNotificationPage.mockResolvedValue({
      items: [older],
      cursor: { id: 'cursor-2' },
      hasMore: false,
    });
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());
    act(() => mockPageListeners.personal({ items: [unread], cursor, hasMore: true }));

    await act(async () => {
      await hook.result.current.loadMore('personal');
    });

    expect(mockNotificationService.getNotificationPage).toHaveBeenCalledWith(
      'owner', 'personal', { cursor, filter: 'all' }
    );
    expect(hook.result.current.channels.personal.items.map((item) => item.id))
      .toEqual(['notification-1', 'notification-older']);
  });

  it('removes vanished prior-head rows while preserving displaced and loaded older rows', async () => {
    const headNewest = { ...unread, id: 'head-newest', createdAt: new Date('2026-08-21T10:00:00Z') };
    const headMiddle = { ...unread, id: 'head-middle', createdAt: new Date('2026-08-21T09:00:00Z') };
    const displaced = { ...unread, id: 'head-oldest', createdAt: new Date('2026-08-21T08:00:00Z') };
    const older = { ...unread, id: 'loaded-tail', createdAt: new Date('2026-08-21T07:00:00Z') };
    mockNotificationService.getNotificationPage.mockResolvedValue({
      items: [older],
      cursor: { id: 'older-cursor' },
      hasMore: false,
    });
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());
    act(() => mockPageListeners.personal({
      items: [headNewest, headMiddle, displaced],
      cursor: { id: 'head-cursor' },
      hasMore: true,
    }));
    await act(async () => hook.result.current.loadMore('personal'));

    const entered = { ...unread, id: 'entered-head', createdAt: new Date('2026-08-21T11:00:00Z') };
    act(() => mockPageListeners.personal({
      items: [entered, headNewest, headMiddle],
      cursor: { id: 'shifted-cursor' },
      hasMore: true,
    }));
    expect(hook.result.current.channels.personal.items.map((item) => item.id)).toEqual([
      'entered-head', 'head-newest', 'head-middle', 'head-oldest', 'loaded-tail',
    ]);

    act(() => mockPageListeners.personal({
      items: [entered, headMiddle, displaced],
      cursor: { id: 'deleted-cursor' },
      hasMore: true,
    }));
    expect(hook.result.current.channels.personal.items.map((item) => item.id)).toEqual([
      'entered-head', 'head-middle', 'head-oldest', 'loaded-tail',
    ]);
  });

  it('scrubs retained paginated rows and cached push resolutions after an actor is blocked', async () => {
    const blockedTail = {
      ...unread,
      id: 'blocked-tail',
      type: 'comment',
      actorId: 'blocked-actor',
      actorPreview: { id: 'blocked-actor', displayName: 'Blocked' },
      commentExcerpt: 'private excerpt',
      createdAt: new Date('2026-08-20T09:00:00Z'),
    };
    mockNotificationService.getNotificationPage.mockResolvedValue({
      items: [blockedTail],
      cursor: { id: blockedTail.id },
      hasMore: false,
    });
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());
    act(() => mockPageListeners.personal({
      items: [unread],
      cursor: { id: unread.id },
      hasMore: true,
    }));
    await act(async () => hook.result.current.loadMore('personal'));
    expect(hook.result.current.channels.personal.items.map((item) => item.id))
      .toContain(blockedTail.id);

    mockBlockedIds = new Set(['blocked-actor']);
    mockIsBlocked = (uid) => mockBlockedIds.has(uid);
    hook.rerender({});
    await expect(hook.result.current.resolveNotification(blockedTail.id, 'personal'))
      .resolves.toBeNull();
    expect(mockNotificationService.getNotificationById).not.toHaveBeenCalled();
    await waitFor(() => expect(mockNotificationService.subscribeToNotificationPage)
      .toHaveBeenCalledTimes(2));
    act(() => mockPageListeners.personal({
      items: [unread],
      cursor: { id: unread.id },
      hasMore: true,
    }));

    expect(hook.result.current.channels.personal.items.map((item) => item.id))
      .not.toContain(blockedTail.id);
  });

  it('uses the deterministic document id order when equal-time head rows disappear', async () => {
    const createdAt = new Date('2026-08-21T09:00:00Z');
    const row = (id) => ({ ...unread, id, createdAt });
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());

    act(() => mockPageListeners.personal({
      items: [row('same-c'), row('same-b'), row('same-a')],
      cursor: { id: 'same-a' },
      hasMore: true,
    }));
    act(() => mockPageListeners.personal({
      items: [row('same-d'), row('same-c'), row('same-b')],
      cursor: { id: 'same-b' },
      hasMore: true,
    }));
    expect(hook.result.current.channels.personal.items.map((item) => item.id))
      .toEqual(['same-d', 'same-c', 'same-b', 'same-a']);

    act(() => mockPageListeners.personal({
      items: [row('same-d'), row('same-b'), row('same-a')],
      cursor: { id: 'same-a' },
      hasMore: true,
    }));
    expect(hook.result.current.channels.personal.items.map((item) => item.id))
      .toEqual(['same-d', 'same-b', 'same-a']);
  });

  it('drops every retained tail row when the realtime filtered head is exhaustive', async () => {
    const older = { ...unread, id: 'loaded-tail', createdAt: new Date('2026-08-20T09:00:00Z') };
    mockNotificationService.getNotificationPage.mockResolvedValue({
      items: [older],
      cursor: { id: 'loaded-tail' },
      hasMore: false,
    });
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());
    act(() => mockPageListeners.personal({
      items: [unread],
      cursor: { id: unread.id },
      hasMore: true,
    }));
    await act(async () => hook.result.current.loadMore('personal'));
    expect(hook.result.current.channels.personal.items).toHaveLength(2);

    act(() => mockPageListeners.personal({
      items: [unread],
      cursor: { id: unread.id },
      hasMore: false,
    }));
    expect(hook.result.current.channels.personal.items).toEqual([unread]);
  });

  it.each([
    ['deleting one row', 'deleteNotificationById', (center) => center.deleteOne(unread)],
    ['marking the channel read', 'markNotificationChannelRead', (center) => center.markChannelRead('personal')],
    ['clearing the channel', 'clearNotificationChannel', (center) => center.clearChannel('personal')],
  ])('does not double-decrement an authoritative count after %s', async (_label, serviceName, mutate) => {
    let finishMutation;
    mockNotificationService[serviceName].mockReturnValueOnce(new Promise((resolve) => {
      finishMutation = resolve;
    }));
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());
    act(() => {
      mockPageListeners.personal({ items: [unread], cursor: null, hasMore: false });
      mockStateListener({ personalUnread: 1, adminUnread: 0 });
    });

    let mutation;
    act(() => { mutation = mutate(hook.result.current); });
    await waitFor(() => expect(mockNotificationService[serviceName]).toHaveBeenCalledTimes(1));
    // The old unread was handled, but a newer unread arrived before the
    // callable response reached the client.
    act(() => mockStateListener({ personalUnread: 1, adminUnread: 0 }));
    await act(async () => {
      finishMutation({ changed: true });
      await mutation;
    });

    expect(hook.result.current.unreadCounts.personal).toBe(1);
  });

  it('keeps a newer authoritative count when a failed optimistic read resync is stale', async () => {
    let rejectRead;
    let finishResync;
    mockNotificationService.setNotificationRead.mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectRead = reject;
    }));
    mockNotificationService.getNotificationState.mockReturnValueOnce(new Promise((resolve) => {
      finishResync = resolve;
    }));
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(mockPageListeners.personal).toBeTruthy());
    act(() => {
      mockPageListeners.personal({ items: [unread], cursor: null, hasMore: false });
      mockStateListener({ personalUnread: 1, adminUnread: 0 });
    });

    let mutation;
    act(() => { mutation = hook.result.current.setRead(unread, true); });
    const observedFailure = mutation.then(() => null, (error) => error);
    await waitFor(() => expect(mockNotificationService.setNotificationRead).toHaveBeenCalledTimes(1));
    await act(async () => {
      rejectRead(Object.assign(new Error('write failed'), { code: 'functions/unavailable' }));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockNotificationService.getNotificationState).toHaveBeenCalledTimes(1));

    act(() => mockStateListener({ personalUnread: 2, adminUnread: 0 }));
    await act(async () => {
      finishResync({ personalUnread: 1, adminUnread: 0 });
      await observedFailure;
    });

    expect(hook.result.current.unreadCounts.personal).toBe(2);
    expect(hook.result.current.channels.personal.items[0].isRead).toBe(false);
  });
});

describe('notificationAfterBlockFilter', () => {
  it('removes blocked direct actors and scrubs them from grouped likes', () => {
    const blocked = (uid) => uid === 'blocked';
    expect(notificationAfterBlockFilter({
      ...unread,
      type: 'comment',
      actorId: 'blocked',
    }, blocked)).toBeNull();
    expect(notificationAfterBlockFilter({
      ...unread,
      type: 'like',
      count: 3,
      actorId: 'blocked',
      actorPreviews: [
        { id: 'blocked', displayName: 'Blocked' },
        { id: 'visible', displayName: 'Visible' },
      ],
    }, blocked)).toMatchObject({
      count: 2,
      actorId: 'visible',
      actorPreviews: [{ id: 'visible', displayName: 'Visible' }],
    });
  });
});
