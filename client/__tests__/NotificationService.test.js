jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ kind: 'collection' })),
  doc: jest.fn((...segments) => ({ kind: 'doc', segments })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn((value) => ({ kind: 'limit', value })),
  onSnapshot: jest.fn(),
  orderBy: jest.fn((...args) => ({ kind: 'orderBy', args })),
  query: jest.fn((...args) => ({ kind: 'query', args })),
  startAfter: jest.fn((cursor) => ({ kind: 'startAfter', cursor })),
  where: jest.fn((...args) => ({ kind: 'where', args })),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ db: { kind: 'db' }, cloudFunctions: { kind: 'functions' } }));

import * as mockFirestore from 'firebase/firestore';
import { httpsCallable as mockHttpsCallable } from 'firebase/functions';

import {
  buildNotificationPageQuery,
  clearNotificationChannel,
  getNotificationFilterPredicates,
  getNotificationPage,
  markNotificationChannelRead,
  NOTIFICATION_PAGE_SIZE,
  resolveNotificationTargetAvailability,
  setNotificationRead,
} from '../src/features/notifications/services/NotificationService';

describe('NotificationService', () => {
  const mockCallable = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallable.mockResolvedValue({ data: {} });
    mockHttpsCallable.mockReturnValue(mockCallable);
  });

  it('builds the bounded channel query with the schema and cursor', () => {
    const cursor = { id: 'cursor' };
    buildNotificationPageQuery('owner', 'admin', { pageSize: 200, cursor });

    expect(mockFirestore.collection).toHaveBeenCalledWith(
      { kind: 'db' }, 'users', 'owner', 'notifications'
    );
    expect(mockFirestore.where).toHaveBeenCalledWith('schemaVersion', '==', 2);
    expect(mockFirestore.where).toHaveBeenCalledWith('channel', '==', 'admin');
    expect(mockFirestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockFirestore.startAfter).toHaveBeenCalledWith(cursor);
    expect(mockFirestore.limit).toHaveBeenCalledWith(NOTIFICATION_PAGE_SIZE);
  });

  it.each([
    ['personal', 'unread', ['isRead', '==', false]],
    ['personal', 'likes', ['type', '==', 'like']],
    ['personal', 'comments', ['type', '==', 'comment']],
    ['personal', 'system', ['type', '==', 'system']],
    ['admin', 'urgent', ['priority', '==', 'urgent']],
    ['admin', 'reports', ['subtype', 'in', ['report_received', 'urgent_escalation']]],
    ['admin', 'destinations', ['subtype', '==', 'destination_review_discovered']],
  ])('adds the indexed %s/%s server predicate', (channel, filter, predicate) => {
    expect(getNotificationFilterPredicates(channel, filter)).toEqual([predicate]);
    buildNotificationPageQuery('owner', channel, { filter });
    expect(mockFirestore.where).toHaveBeenCalledWith(...predicate);
  });

  it('normalizes a filter that does not belong to its channel back to all', () => {
    expect(getNotificationFilterPredicates('admin', 'likes')).toEqual([]);
    buildNotificationPageQuery('owner', 'admin', { filter: 'likes' });
    expect(mockFirestore.where).toHaveBeenCalledTimes(2);
  });

  it('returns a cursor and another-page hint for a full page', async () => {
    const docs = Array.from({ length: 25 }, (_, index) => ({
      id: `notification-${index}`,
      data: () => ({
        schemaVersion: 2,
        channel: 'personal',
        type: 'system',
        createdAt: new Date(2026, 0, index + 1),
      }),
    }));
    mockFirestore.getDocs.mockResolvedValue({ docs });

    const page = await getNotificationPage('owner', 'personal');

    expect(page.items).toHaveLength(25);
    expect(page.cursor).toBe(docs[24]);
    expect(page.hasMore).toBe(true);
  });

  it('sends only notification ids, read state, and one explicit channel to callables', async () => {
    await setNotificationRead('notification-1', false);
    expect(mockHttpsCallable).toHaveBeenCalledWith({ kind: 'functions' }, 'setNotificationRead');
    expect(mockCallable).toHaveBeenLastCalledWith({ notificationId: 'notification-1', read: false });

    mockHttpsCallable.mockClear();
    await markNotificationChannelRead('admin');
    expect(mockHttpsCallable).toHaveBeenCalledWith({ kind: 'functions' }, 'markAllNotificationsRead');
    expect(mockCallable).toHaveBeenLastCalledWith({ channel: 'admin' });

    mockHttpsCallable.mockClear();
    await clearNotificationChannel('personal');
    expect(mockHttpsCallable).toHaveBeenCalledWith({ kind: 'functions' }, 'clearNotifications');
    expect(mockCallable).toHaveBeenLastCalledWith({ channel: 'personal' });
  });

  it('resolves canonical social targets and their current availability', async () => {
    mockFirestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'active' }),
    });
    await expect(resolveNotificationTargetAvailability({
      type: 'like',
      navigation: { action: 'open_route', routeId: 'route-1' },
    })).resolves.toEqual({ available: true, reason: 'active' });
    expect(mockFirestore.doc).toHaveBeenLastCalledWith({ kind: 'db' }, 'routes', 'route-1');

    mockFirestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'moderation_hold' }),
    });
    await expect(resolveNotificationTargetAvailability({
      type: 'comment',
      navigation: {
        action: 'open_comment',
        parentType: 'recommendation',
        parentId: 'post-1',
        commentId: 'comment-1',
      },
    })).resolves.toEqual({ available: false, reason: 'held' });
    expect(mockFirestore.doc).toHaveBeenLastCalledWith(
      { kind: 'db' }, 'recommendations', 'post-1', 'comments', 'comment-1'
    );

    mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(resolveNotificationTargetAvailability({
      type: 'like',
      navigation: { action: 'open_recommendation', recommendationId: 'deleted' },
    })).resolves.toEqual({ available: false, reason: 'deleted' });
  });

  it('requires the root of a reply notification to remain active', async () => {
    mockFirestore.getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'active', threadType: 'reply', threadRootId: 'root-1' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'moderation_hold', threadType: 'root' }),
      });
    await expect(resolveNotificationTargetAvailability({
      type: 'comment',
      subtype: 'new_reply',
      navigation: {
        action: 'open_comment',
        parentType: 'recommendation',
        parentId: 'post-1',
        commentId: 'reply-1',
      },
    })).resolves.toEqual({ available: false, reason: 'held' });
    expect(mockFirestore.getDoc).toHaveBeenCalledTimes(2);
  });

  it('keeps a rules-hidden target contextual instead of guessing or navigating', async () => {
    mockFirestore.getDoc.mockRejectedValue({ code: 'firestore/permission-denied' });
    await expect(resolveNotificationTargetAvailability({
      type: 'like',
      navigation: { action: 'open_recommendation', recommendationId: 'held-or-deleted' },
    })).resolves.toEqual({ available: false, reason: 'unavailable' });
  });

  it('revalidates restored system alerts and preserves transient read failures for retry', async () => {
    mockFirestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'moderation_hold' }),
    });
    await expect(resolveNotificationTargetAvailability({
      type: 'system',
      subtype: 'content_restored',
      navigation: { action: 'open_recommendation', recommendationId: 'post-1' },
    })).resolves.toEqual({ available: false, reason: 'held' });

    mockFirestore.getDoc.mockRejectedValueOnce({ code: 'firestore/unavailable' });
    await expect(resolveNotificationTargetAvailability({
      type: 'system',
      subtype: 'content_restored',
      navigation: { action: 'open_recommendation', recommendationId: 'post-1' },
    })).rejects.toMatchObject({ code: 'unavailable', reason: 'retryable' });
  });
});
