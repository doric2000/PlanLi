import {
  buildNotificationLikesTarget,
  buildNotificationRouteAction,
  buildStatusActionForError,
  getNotificationFilterOptions,
  getNotificationLikeMessageParts,
  getNotificationPresentation,
  normalizeNotification,
  NotificationChannel,
  NotificationFilter,
  notificationMatchesFilter,
} from '../src/features/notifications/models/NotificationModel';

describe('NotificationModel schema v2', () => {
  it('presents direct replies distinctly from comments on owned content', () => {
    expect(getNotificationPresentation({
      type: 'comment',
      subtype: 'new_reply',
      actorPreview: { displayName: 'נועה' },
      commentExcerpt: 'בשמחה!',
    })).toMatchObject({
      message: 'נועה השיב/ה לתגובה שלך',
      detail: 'בשמחה!',
      label: 'תגובה',
    });
  });
  it('presents content-status alerts without exposing moderation reasons', () => {
    expect(getNotificationPresentation({
      type: 'system',
      subtype: 'content_held',
      target: { title: 'מסלול לצפון' },
    })).toMatchObject({
      message: 'התוכן שלך הועבר זמנית לבדיקה',
      detail: 'מסלול לצפון',
      tone: 'system',
    });
  });

  it('uses the contextual destination-review message supplied by the server', () => {
    expect(getNotificationPresentation({
      type: 'system',
      subtype: 'content_held',
      message: 'היעד ניר דוד נמצא בבקרת מנהל. התוכן יחזור אוטומטית לאחר השלמת האישור.',
    }).message).toContain('ניר דוד');
    expect(getNotificationPresentation({
      type: 'system',
      subtype: 'content_restored',
      message: 'הבדיקה של ניר דוד הושלמה והתוכן שלך חזר להיות זמין.',
    }).message).toContain('חזר להיות זמין');
  });

  it.each([
    ['moderation_warning', 'נשלחה אליך אזהרה מצוות הקהילה'],
    ['account_suspended', 'החשבון שלך הושעה בעקבות החלטת מודרציה'],
    ['account_reinstated', 'החשבון שלך חזר לפעילות'],
  ])('presents %s as a private account update', (subtype, message) => {
    expect(getNotificationPresentation({ type: 'system', subtype })).toMatchObject({ message });
    expect(buildNotificationRouteAction({
      type: 'system', subtype, navigation: { action: 'open_profile', profileId: 'user-1' },
    })).toMatchObject({ type: 'status', reason: 'account' });
  });

  it('bounds renderable previews and rejects unsafe media or document ids', () => {
    const notification = normalizeNotification('notification-1', {
      schemaVersion: 2,
      channel: 'personal',
      type: 'comment',
      actorPreviews: Array.from({ length: 7 }, (_, index) => ({
        id: `actor-${index}`,
        displayName: `Actor ${index}`,
        photoURL: `https://example.com/${index}.jpg`,
      })),
      commentExcerpt: 'x'.repeat(240),
      target: {
        id: 'post/unsafe',
        thumbUrls: [
          'https://example.com/1.jpg',
          'javascript:alert(1)',
          'https://example.com/2.jpg',
          'https://example.com/3.jpg',
          'https://example.com/4.jpg',
          'https://example.com/5.jpg',
        ],
      },
    });

    expect(notification.actorPreviews).toHaveLength(4);
    expect(notification.commentExcerpt).toHaveLength(160);
    expect(notification.target.id).toBeUndefined();
    expect(notification.target.thumbUrls).toEqual([
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
      'https://example.com/3.jpg',
      'https://example.com/4.jpg',
    ]);
  });

  it.each([
    [
      { action: 'open_recommendation', recommendationId: 'post-1' },
      { type: 'navigate', routeName: 'RecommendationDetail', params: { postId: 'post-1' } },
    ],
    [
      { action: 'open_route', routeId: 'route-1' },
      { type: 'navigate', routeName: 'RouteDetail', params: { routeId: 'route-1' } },
    ],
    [
      {
        action: 'open_comment',
        parentType: 'recommendation',
        parentId: 'post-2',
        commentId: 'comment-1',
      },
      {
        type: 'navigate',
        routeName: 'RecommendationDetail',
        params: { postId: 'post-2', openComments: true, commentId: 'comment-1' },
      },
    ],
    [
      {
        action: 'open_comment',
        parentType: 'route',
        parentId: 'route-2',
        commentId: 'comment-2',
      },
      {
        type: 'navigate',
        routeName: 'RouteDetail',
        params: { routeId: 'route-2', openComments: true, commentId: 'comment-2' },
      },
    ],
    [
      { action: 'open_moderation_case', caseId: 'case-1' },
      { type: 'navigate', routeName: 'AdminPanel', params: { tab: 'reports', caseId: 'case-1' } },
    ],
    [
      { action: 'open_destination_review', countryId: 'israel', cityId: 'haifa' },
      {
        type: 'navigate',
        routeName: 'AdminPanel',
        params: { tab: 'destinations', countryId: 'israel', cityId: 'haifa' },
      },
    ],
  ])('maps an allowlisted intent without executing persisted route names', (navigation, expected) => {
    expect(buildNotificationRouteAction({ navigation, target: {} })).toEqual(expected);
  });

  it('keeps held, deleted, malformed, and unsupported trip targets contextual', () => {
    expect(buildNotificationRouteAction({
      type: 'system',
      subtype: 'content_held',
      target: { id: 'post' },
      navigation: { action: 'open_recommendation', recommendationId: 'post' },
    })).toMatchObject({ type: 'status', reason: 'held' });
    expect(buildNotificationRouteAction({
      type: 'system',
      subtype: 'content_deleted',
      target: { id: 'post' },
      navigation: { action: 'open_recommendation', recommendationId: 'post' },
    })).toMatchObject({ type: 'status', reason: 'deleted' });
    expect(buildNotificationRouteAction({
      type: 'system',
      subtype: 'content_restored',
      target: { id: 'post' },
      navigation: { action: 'open_recommendation', recommendationId: 'post' },
    })).toEqual({ type: 'navigate', routeName: 'RecommendationDetail', params: { postId: 'post' } });
    expect(buildNotificationRouteAction({
      target: { status: 'held' },
      navigation: { action: 'open_recommendation', recommendationId: 'post' },
    })).toMatchObject({ type: 'status', reason: 'held' });
    expect(buildNotificationRouteAction({
      target: {},
      navigation: { action: 'open_recommendation' },
    })).toMatchObject({ type: 'status', reason: 'deleted' });
    expect(buildNotificationRouteAction({
      target: {},
      navigation: { action: 'open_trip', tripId: 'trip-1' },
    })).toMatchObject({ type: 'status', reason: 'unsupported' });
    expect(buildNotificationRouteAction({
      target: {},
      navigation: { action: 'SomePersistedRoute', url: 'https://evil.example' },
    })).toMatchObject({ type: 'status' });
  });

  it('maps resolved target failures to contextual held and unavailable states', () => {
    expect(buildStatusActionForError({ reason: 'held' }))
      .toMatchObject({ type: 'status', reason: 'held' });
    expect(buildStatusActionForError({ reason: 'permission-denied' }))
      .toMatchObject({ type: 'status', reason: 'unavailable' });
  });

  it('exposes a structured, clickable Hebrew like-count label', () => {
    expect(getNotificationLikeMessageParts({
      type: 'like',
      count: 1,
      actorPreview: { displayName: 'נועה' },
      target: { title: 'מסלול לצפון' },
    })).toEqual({
      actionLabel: '1 לייק',
      remainder: 'חדש מנועה על “מסלול לצפון”',
    });
    expect(getNotificationLikeMessageParts({
      type: 'like',
      count: 4,
      target: { type: 'route' },
    })).toEqual({
      actionLabel: '4 לייקים',
      remainder: 'חדשים על המסלול שלך',
    });
    expect(getNotificationLikeMessageParts({ type: 'comment' })).toBeNull();
  });

  it('normalizes and presents like milestones as total-like achievements', () => {
    const notification = normalizeNotification('milestone-1', {
      schemaVersion: 2,
      channel: 'personal',
      type: 'like',
      subtype: 'like_milestone',
      count: 100,
      milestone: 100,
      target: { type: 'recommendation', title: 'הרמון' },
    });

    expect(notification.milestone).toBe(100);
    expect(getNotificationPresentation(notification)).toMatchObject({
      message: 'התוכן שלך הגיע ל־100 לייקים',
      likeMessageParts: {
        actionLabel: '100 לייקים',
        remainder: 'על “הרמון” — אבן דרך חדשה!',
      },
    });
  });

  it('derives liker-list targets only from allowlisted typed notification actions', () => {
    expect(buildNotificationLikesTarget({
      type: 'like',
      navigation: { action: 'open_recommendation', recommendationId: 'post-1' },
    })).toEqual({ collectionName: 'recommendations', itemId: 'post-1' });
    expect(buildNotificationLikesTarget({
      type: 'like',
      navigation: { action: 'open_route', routeId: 'route-1' },
    })).toEqual({ collectionName: 'routes', itemId: 'route-1' });
    expect(buildNotificationLikesTarget({
      type: 'like',
      navigation: { action: 'open_trip', tripId: 'trip-1' },
    })).toBeNull();
    expect(buildNotificationLikesTarget({
      type: 'comment',
      navigation: { action: 'open_recommendation', recommendationId: 'post-1' },
    })).toBeNull();
    expect(buildNotificationLikesTarget({
      type: 'like',
      target: { id: 'post-without-typed-navigation-id' },
      navigation: { action: 'open_recommendation' },
    })).toBeNull();
  });

  it('uses channel-specific filters and unread matching', () => {
    expect(getNotificationFilterOptions(NotificationChannel.ADMIN, 3).map(({ key }) => key))
      .toEqual(['all', 'unread', 'urgent', 'reports', 'destinations']);
    expect(notificationMatchesFilter({ isRead: false }, NotificationFilter.UNREAD)).toBe(true);
    expect(notificationMatchesFilter({ type: 'like' }, NotificationFilter.LIKES)).toBe(true);
    expect(notificationMatchesFilter({
      type: 'moderation',
      navigation: { action: 'open_destination_review' },
    }, NotificationFilter.REPORTS)).toBe(false);
  });
});
