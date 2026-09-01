export const NOTIFICATION_SCHEMA_VERSION = 2;

export const NotificationChannel = Object.freeze({
  PERSONAL: 'personal',
  ADMIN: 'admin',
});

export const NotificationType = Object.freeze({
  LIKE: 'like',
  COMMENT: 'comment',
  SYSTEM: 'system',
  MODERATION: 'moderation',
});

export const NotificationPriority = Object.freeze({
  NORMAL: 'normal',
  URGENT: 'urgent',
});

export const NotificationNavigationAction = Object.freeze({
  RECOMMENDATION: 'open_recommendation',
  ROUTE: 'open_route',
  TRIP: 'open_trip',
  COMMENT: 'open_comment',
  PROFILE: 'open_profile',
  MODERATION_CASE: 'open_moderation_case',
  DESTINATION_REVIEW: 'open_destination_review',
});

export const NotificationFilter = Object.freeze({
  ALL: 'all',
  UNREAD: 'unread',
  LIKES: 'likes',
  COMMENTS: 'comments',
  SYSTEM: 'system',
  URGENT: 'urgent',
  REPORTS: 'reports',
  DESTINATIONS: 'destinations',
});

const FILTERS_BY_CHANNEL = Object.freeze({
  [NotificationChannel.PERSONAL]: Object.freeze([
    NotificationFilter.ALL,
    NotificationFilter.UNREAD,
    NotificationFilter.LIKES,
    NotificationFilter.COMMENTS,
    NotificationFilter.SYSTEM,
  ]),
  [NotificationChannel.ADMIN]: Object.freeze([
    NotificationFilter.ALL,
    NotificationFilter.UNREAD,
    NotificationFilter.URGENT,
    NotificationFilter.REPORTS,
    NotificationFilter.DESTINATIONS,
  ]),
});

const ALLOWED_TYPES = new Set(Object.values(NotificationType));
const ALLOWED_CHANNELS = new Set(Object.values(NotificationChannel));
const ALLOWED_ACTIONS = new Set(Object.values(NotificationNavigationAction));
const CONTENT_NAVIGATION_ACTIONS = new Set([
  NotificationNavigationAction.RECOMMENDATION,
  NotificationNavigationAction.ROUTE,
  NotificationNavigationAction.TRIP,
  NotificationNavigationAction.COMMENT,
]);
const UNAVAILABLE_STATUSES = new Set([
  'deleted', 'held', 'inactive', 'moderation_hold', 'unavailable',
]);
const HELD_STATUSES = new Set(['held', 'moderation_hold']);

const cleanText = (value, maximum = 180) => (
  typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, maximum) : ''
);

const cleanId = (value) => {
  const result = cleanText(value, 180);
  return result && !result.includes('/') ? result : '';
};

const cleanUrl = (value) => {
  const result = cleanText(value, 2000);
  return /^(https?:|file:|blob:|data:image\/|content:|ph:|assets-library:)/iu.test(result)
    ? result
    : '';
};

const cleanCount = (value) => Math.min(
  Number.MAX_SAFE_INTEGER,
  Math.max(1, Math.trunc(Number(value) || 1))
);

export function timestampToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const seconds = Number(value.seconds ?? value._seconds);
  if (Number.isFinite(seconds)) {
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeActor(value) {
  if (!value || typeof value !== 'object') return null;
  const id = cleanId(value.id || value.uid);
  const displayName = cleanText(value.displayName || value.name, 80) || 'מטייל/ת';
  const photoURL = cleanUrl(value.photoURL || value.avatarURL) || null;
  return { ...(id ? { id } : {}), displayName, photoURL };
}

function normalizeTarget(value = {}) {
  const type = cleanText(value.type, 40).toLowerCase();
  const id = cleanId(value.id);
  const parentType = cleanText(value.parentType, 40).toLowerCase();
  const parentId = cleanId(value.parentId);
  const countryId = cleanId(value.countryId);
  const cityId = cleanId(value.cityId || (type === 'destination' ? value.id : ''));
  const status = cleanText(value.status || value.availability, 40).toLowerCase();
  const rawThumbs = Array.isArray(value.thumbUrls)
    ? value.thumbUrls
    : [value.thumbUrl].filter(Boolean);
  const thumbUrls = Array.from(new Set(rawThumbs.map(cleanUrl).filter(Boolean))).slice(0, 4);
  return {
    ...(type ? { type } : {}),
    ...(id ? { id } : {}),
    ...(parentType ? { parentType } : {}),
    ...(parentId ? { parentId } : {}),
    ...(countryId ? { countryId } : {}),
    ...(cityId ? { cityId } : {}),
    ...(status ? { status } : {}),
    title: cleanText(value.title, 140),
    thumbUrls,
  };
}

function normalizeNavigation(value = {}) {
  const action = cleanText(value.action, 60).toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) return action ? { action } : null;
  const result = { action };
  [
    'recommendationId', 'routeId', 'tripId', 'profileId', 'uid', 'caseId',
    'commentId', 'postId', 'parentId', 'countryId', 'cityId', 'targetId',
  ].forEach((key) => {
    const normalized = cleanId(value[key]);
    if (normalized) result[key] = normalized;
  });
  const parentType = cleanText(value.parentType || value.postType, 40).toLowerCase();
  if (parentType) result.parentType = parentType;
  return result;
}

/**
 * Converts canonical Firestore data into a small, render-safe notification.
 * Functions remain authoritative for the persisted schema.
 */
export function normalizeNotification(id, value = {}) {
  const type = ALLOWED_TYPES.has(value.type) ? value.type : NotificationType.SYSTEM;
  const derivedChannel = type === NotificationType.MODERATION
    ? NotificationChannel.ADMIN
    : NotificationChannel.PERSONAL;
  const channel = ALLOWED_CHANNELS.has(value.channel) ? value.channel : derivedChannel;
  const directActor = normalizeActor(value.actorPreview);
  const actorPreviews = (Array.isArray(value.actorPreviews) ? value.actorPreviews : [])
    .map(normalizeActor)
    .filter(Boolean)
    .slice(0, 4);
  if (!actorPreviews.length && directActor) actorPreviews.push(directActor);

  return {
    id: cleanId(id),
    schemaVersion: Number(value.schemaVersion) || 1,
    channel,
    type,
    subtype: cleanText(value.subtype, 60).toLowerCase(),
    priority: value.priority === NotificationPriority.URGENT
      ? NotificationPriority.URGENT
      : NotificationPriority.NORMAL,
    isRead: value.isRead === true,
    readAt: timestampToDate(value.readAt),
    createdAt: timestampToDate(value.createdAt || value.timestamp),
    count: cleanCount(value.count),
    milestone: value.subtype === 'like_milestone' ? cleanCount(value.milestone) : null,
    actorId: cleanId(value.actorId || directActor?.id),
    actorPreview: directActor || actorPreviews[0] || null,
    actorPreviews,
    commentExcerpt: cleanText(value.commentExcerpt, 160),
    title: cleanText(value.title, 140),
    message: cleanText(value.message, 240),
    target: normalizeTarget(value.target),
    navigation: normalizeNavigation(value.navigation),
  };
}

export function getNotificationFilterOptions(channel, unreadCount = 0) {
  if (channel === NotificationChannel.ADMIN) {
    return [
      { key: NotificationFilter.ALL, label: 'הכול' },
      { key: NotificationFilter.UNREAD, label: 'לא נקראו', count: unreadCount },
      { key: NotificationFilter.URGENT, label: 'דחוף' },
      { key: NotificationFilter.REPORTS, label: 'דיווחים' },
      { key: NotificationFilter.DESTINATIONS, label: 'בקרת ערים' },
    ];
  }
  return [
    { key: NotificationFilter.ALL, label: 'הכול' },
    { key: NotificationFilter.UNREAD, label: 'לא נקראו', count: unreadCount },
    { key: NotificationFilter.LIKES, label: 'לייקים' },
    { key: NotificationFilter.COMMENTS, label: 'תגובות' },
    { key: NotificationFilter.SYSTEM, label: 'מערכת' },
  ];
}

export function getNotificationFiltersForChannel(channel) {
  return FILTERS_BY_CHANNEL[channel] || FILTERS_BY_CHANNEL[NotificationChannel.PERSONAL];
}

export function normalizeNotificationFilter(channel, filter) {
  return getNotificationFiltersForChannel(channel).includes(filter)
    ? filter
    : NotificationFilter.ALL;
}

export function notificationMatchesFilter(notification, filter) {
  if (!notification || filter === NotificationFilter.ALL) return true;
  if (filter === NotificationFilter.UNREAD) return !notification.isRead;
  if (filter === NotificationFilter.LIKES) return notification.type === NotificationType.LIKE;
  if (filter === NotificationFilter.COMMENTS) return notification.type === NotificationType.COMMENT;
  if (filter === NotificationFilter.SYSTEM) return notification.type === NotificationType.SYSTEM;
  if (filter === NotificationFilter.URGENT) return notification.priority === NotificationPriority.URGENT;
  if (filter === NotificationFilter.DESTINATIONS) {
    return notification.navigation?.action === NotificationNavigationAction.DESTINATION_REVIEW
      || notification.subtype === 'destination_review'
      || notification.target?.type === 'destination';
  }
  if (filter === NotificationFilter.REPORTS) {
    return notification.type === NotificationType.MODERATION
      && !notificationMatchesFilter(notification, NotificationFilter.DESTINATIONS);
  }
  return true;
}

const firstId = (...values) => values.map(cleanId).find(Boolean) || '';

function targetLabel(notification) {
  const title = notification?.target?.title;
  if (title) return `“${title}”`;
  if (notification?.target?.type === 'route') return 'המסלול שלך';
  return 'התוכן שלך';
}

export function getNotificationLikeMessageParts(notification) {
  if (notification?.type !== NotificationType.LIKE) return null;
  if (notification.subtype === 'like_milestone') {
    const milestone = cleanCount(notification.milestone || notification.count);
    return {
      actionLabel: `${milestone} לייקים`,
      remainder: `על ${targetLabel(notification)} — אבן דרך חדשה!`,
    };
  }
  const count = cleanCount(notification.count);
  const actor = notification.actorPreview?.displayName || notification.actorPreviews?.[0]?.displayName;
  const actionLabel = count === 1 ? '1 לייק' : `${count} לייקים`;
  const remainder = count === 1
    ? `${actor ? `חדש מ${actor}` : 'חדש'} על ${targetLabel(notification)}`
    : `חדשים על ${targetLabel(notification)}`;
  return { actionLabel, remainder };
}

export function buildNotificationLikesTarget(notification) {
  if (notification?.type !== NotificationType.LIKE) return null;
  const navigation = notification.navigation || {};
  if (navigation.action === NotificationNavigationAction.RECOMMENDATION) {
    const itemId = firstId(
      navigation.recommendationId,
      navigation.postId,
      navigation.targetId
    );
    return itemId ? { collectionName: 'recommendations', itemId } : null;
  }
  if (navigation.action === NotificationNavigationAction.ROUTE) {
    const itemId = firstId(navigation.routeId, navigation.targetId);
    return itemId ? { collectionName: 'routes', itemId } : null;
  }
  return null;
}

export function formatNotificationMessage(notification) {
  if (!notification) return 'עדכון חדש';
  if (notification.message) return notification.message;
  const actor = notification.actorPreview?.displayName || notification.actorPreviews?.[0]?.displayName;
  const count = cleanCount(notification.count);
  if (notification.type === NotificationType.LIKE) {
    if (notification.subtype === 'like_milestone') {
      const milestone = cleanCount(notification.milestone || count);
      return `התוכן שלך הגיע ל־${milestone} לייקים`;
    }
    if (count > 1) return `${count} לייקים חדשים על ${targetLabel(notification)}`;
    return actor
      ? `לייק חדש מ${actor} על ${targetLabel(notification)}`
      : `לייק חדש על ${targetLabel(notification)}`;
  }
  if (notification.type === NotificationType.COMMENT) {
    if (notification.subtype === 'new_reply') {
      return actor
        ? `${actor} השיב/ה לתגובה שלך`
        : 'השיבו לתגובה שלך';
    }
    if (count > 1) return `${count} תגובות חדשות על ${targetLabel(notification)}`;
    return actor
      ? `תגובה חדשה מ${actor} על ${targetLabel(notification)}`
      : `תגובה חדשה על ${targetLabel(notification)}`;
  }
  if (notification.type === NotificationType.MODERATION) {
    if (notification.navigation?.action === NotificationNavigationAction.DESTINATION_REVIEW
      || notification.target?.type === 'destination') {
      return 'יעד חדש ממתין לבקרת איכות';
    }
    return notification.priority === NotificationPriority.URGENT
      ? 'דיווח בטיחות דחוף ממתין לבדיקה'
      : 'דיווח קהילה חדש ממתין לבדיקה';
  }
  if (notification.type === NotificationType.SYSTEM) {
    if (notification.subtype === 'content_held') {
      return notification.message || 'התוכן שלך הועבר זמנית לבדיקה';
    }
    if (notification.subtype === 'content_restored') {
      return notification.message || 'התוכן שלך חזר להיות זמין';
    }
    if (notification.subtype === 'content_deleted') {
      return 'התוכן שלך הוסר';
    }
    if (notification.subtype === 'moderation_warning') {
      return 'נשלחה אליך אזהרה מצוות הקהילה';
    }
    if (notification.subtype === 'account_suspended') {
      return 'החשבון שלך הושעה בעקבות החלטת מודרציה';
    }
    if (notification.subtype === 'account_reinstated') {
      return 'החשבון שלך חזר לפעילות';
    }
  }
  return notification.title || 'עדכון חדש מ־PlanLi';
}

export function getNotificationPresentation(notification) {
  const message = formatNotificationMessage(notification);
  if (notification.type === NotificationType.LIKE) {
    return {
      message,
      detail: '',
      icon: 'heart',
      tone: 'like',
      label: 'לייק',
      likeMessageParts: getNotificationLikeMessageParts(notification),
    };
  }
  if (notification.type === NotificationType.COMMENT) {
    return {
      message,
      detail: notification.commentExcerpt,
      icon: 'chatbubble',
      tone: 'comment',
      label: 'תגובה',
    };
  }
  if (notification.type === NotificationType.MODERATION) {
    const destination = notification.navigation?.action === NotificationNavigationAction.DESTINATION_REVIEW
      || notification.target?.type === 'destination';
    return {
      message,
      detail: notification.target?.title,
      icon: destination ? 'location' : 'shield-checkmark',
      tone: notification.priority === NotificationPriority.URGENT ? 'urgent' : 'admin',
      label: destination ? 'בקרת יעד' : 'ניהול',
    };
  }
  return {
    message,
    detail: notification.target?.title,
    icon: 'information-circle',
    tone: 'system',
    label: 'מערכת',
  };
}

function statusAction(reason) {
  if (reason === 'retryable') {
    return {
      type: 'status',
      reason,
      retryable: true,
      title: 'לא הצלחנו לבדוק את התוכן',
      message: 'בדקו את החיבור לרשת ונסו לפתוח את ההתראה שוב.',
    };
  }
  if (reason === 'held') {
    return {
      type: 'status',
      reason,
      title: 'התוכן נמצא בבדיקה',
      message: 'התוכן הושהה זמנית ולכן אי אפשר לפתוח אותו כרגע.',
    };
  }
  if (reason === 'deleted') {
    return {
      type: 'status',
      reason,
      title: 'התוכן כבר לא זמין',
      message: 'ייתכן שהתוכן נמחק או הוסר מאז שנשלחה ההתראה.',
    };
  }
  if (reason === 'unavailable') {
    return {
      type: 'status',
      reason,
      title: 'התוכן אינו זמין כרגע',
      message: 'ייתכן שהתוכן הוסר או הועבר לבדיקה. אפשר לחזור להתראות ולנסות שוב מאוחר יותר.',
    };
  }
  if (reason === 'account') {
    return {
      type: 'status',
      reason,
      title: 'עדכון לגבי החשבון',
      message: 'פרטי ההחלטה מופיעים בהתראה. אם החשבון פעיל אפשר להמשיך להשתמש באפליקציה כרגיל.',
    };
  }
  return {
    type: 'status',
    reason: 'unsupported',
    title: 'לא ניתן לפתוח את ההתראה',
    message: 'ההתראה נשמרה, אבל היעד שלה אינו נתמך בגרסה הזו.',
  };
}

/**
 * Public route-action contract used by NotificationScreen and push-response
 * routing. Persisted route names or URLs are never executed.
 */
export function buildNotificationRouteAction(notification) {
  if (notification?.type === NotificationType.SYSTEM) {
    if (notification.subtype === 'content_held') return statusAction('held');
    if (notification.subtype === 'content_deleted') return statusAction('deleted');
    if (['moderation_warning', 'account_suspended', 'account_reinstated'].includes(notification.subtype)) {
      return statusAction('account');
    }
  }
  const targetStatus = cleanText(notification?.target?.status, 40).toLowerCase();
  if (UNAVAILABLE_STATUSES.has(targetStatus)) {
    return statusAction(HELD_STATUSES.has(targetStatus) ? 'held' : 'deleted');
  }

  const navigation = notification?.navigation;
  const target = notification?.target || {};
  const action = navigation?.action;
  if (!ALLOWED_ACTIONS.has(action)) return statusAction('unsupported');

  if (action === NotificationNavigationAction.RECOMMENDATION) {
    const postId = firstId(navigation.recommendationId, navigation.postId, navigation.targetId, target.id);
    return postId
      ? { type: 'navigate', routeName: 'RecommendationDetail', params: { postId } }
      : statusAction('deleted');
  }
  if (action === NotificationNavigationAction.ROUTE) {
    const routeId = firstId(navigation.routeId, navigation.targetId, target.id);
    return routeId
      ? { type: 'navigate', routeName: 'RouteDetail', params: { routeId } }
      : statusAction('deleted');
  }
  if (action === NotificationNavigationAction.COMMENT) {
    const parentType = cleanText(navigation.parentType || target.parentType || target.type, 40).toLowerCase();
    const parentId = firstId(navigation.parentId, navigation.postId, target.parentId, target.id);
    const commentId = firstId(navigation.commentId, target.type === 'comment' ? target.id : '');
    if (!parentId) return statusAction('deleted');
    if (parentType === 'recommendation') {
      return {
        type: 'navigate',
        routeName: 'RecommendationDetail',
        params: { postId: parentId, openComments: true, ...(commentId ? { commentId } : {}) },
      };
    }
    if (parentType === 'route') {
      return {
        type: 'navigate',
        routeName: 'RouteDetail',
        params: { routeId: parentId, openComments: true, ...(commentId ? { commentId } : {}) },
      };
    }
    return statusAction('unsupported');
  }
  if (action === NotificationNavigationAction.PROFILE) {
    const uid = firstId(navigation.profileId, navigation.uid, navigation.targetId, target.id);
    return uid
      ? { type: 'navigate', routeName: 'UserProfile', params: { uid } }
      : statusAction('deleted');
  }
  if (action === NotificationNavigationAction.MODERATION_CASE) {
    const caseId = firstId(navigation.caseId);
    return caseId
      ? { type: 'navigate', routeName: 'AdminPanel', params: { tab: 'reports', caseId } }
      : statusAction('deleted');
  }
  if (action === NotificationNavigationAction.DESTINATION_REVIEW) {
    const countryId = firstId(navigation.countryId, target.countryId);
    const cityId = firstId(navigation.cityId, target.cityId, target.id);
    return countryId && cityId
      ? { type: 'navigate', routeName: 'AdminPanel', params: { tab: 'destinations', countryId, cityId } }
      : statusAction('deleted');
  }

  // Trips do not yet have a supported root detail route.
  return statusAction('unsupported');
}

export function notificationRequiresAvailabilityCheck(notification) {
  return CONTENT_NAVIGATION_ACTIONS.has(notification?.navigation?.action);
}

export function buildStatusActionForError(error) {
  const code = cleanText(error?.code, 80).replace(/^(firestore|functions)\//u, '');
  const reason = cleanText(
    error?.details?.reason || error?.customData?.details?.reason || error?.reason,
    80
  ).toLowerCase();
  if (
    reason.includes('retry')
    || code === 'unavailable'
    || code === 'deadline-exceeded'
    || code === 'network-request-failed'
  ) {
    return statusAction('retryable');
  }
  if (reason.includes('hold') || reason.includes('held') || reason.includes('inactive')) {
    return statusAction('held');
  }
  if (reason.includes('missing') || reason.includes('deleted') || reason.includes('not_found')) {
    return statusAction('deleted');
  }
  if (reason.includes('unavailable') || reason.includes('permission')) {
    return statusAction('unavailable');
  }
  return statusAction('unsupported');
}

export const PostType = Object.freeze({
  RECOMMENDATION: 'recommendation',
  ROUTE: 'route',
});
