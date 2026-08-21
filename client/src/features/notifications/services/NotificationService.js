import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

import { cloudFunctions, db } from '../../../config/firebase';
import {
  NOTIFICATION_SCHEMA_VERSION,
  NotificationChannel,
  NotificationFilter,
  NotificationNavigationAction,
  normalizeNotificationFilter,
  normalizeNotification,
} from '../models/NotificationModel';

export const NOTIFICATION_PAGE_SIZE = 25;

export function getNotificationFilterPredicates(channel, filter) {
  const normalized = normalizeNotificationFilter(channel, filter);
  if (normalized === NotificationFilter.UNREAD) return [['isRead', '==', false]];
  if (normalized === NotificationFilter.LIKES) return [['type', '==', 'like']];
  if (normalized === NotificationFilter.COMMENTS) return [['type', '==', 'comment']];
  if (normalized === NotificationFilter.SYSTEM) return [['type', '==', 'system']];
  if (normalized === NotificationFilter.URGENT) return [['priority', '==', 'urgent']];
  if (normalized === NotificationFilter.REPORTS) {
    return [['subtype', 'in', ['report_received', 'urgent_escalation']]];
  }
  if (normalized === NotificationFilter.DESTINATIONS) {
    return [['subtype', '==', 'destination_review_discovered']];
  }
  return [];
}

const callables = new Map();

const call = async (name, payload = {}) => {
  if (!callables.has(name)) callables.set(name, httpsCallable(cloudFunctions, name));
  const response = await callables.get(name)(payload);
  return response.data;
};

const notificationsRef = (userId) => collection(db, 'users', userId, 'notifications');
const notificationRef = (userId, notificationId) => (
  doc(db, 'users', userId, 'notifications', notificationId)
);
const notificationStateRef = (userId) => doc(db, 'users', userId, 'notificationState', 'state');

const CONTENT_COLLECTIONS = Object.freeze({
  recommendation: 'recommendations',
  route: 'routes',
  trip: 'trips',
});
const HELD_TARGET_STATUSES = new Set(['held', 'inactive', 'moderation_hold']);

function safeTargetId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 180 && !value.includes('/')
    ? value
    : '';
}

function notificationTargetRef(notification) {
  const navigation = notification.navigation || {};
  if (navigation.action === NotificationNavigationAction.RECOMMENDATION) {
    const id = safeTargetId(navigation.recommendationId);
    return id ? doc(db, 'recommendations', id) : null;
  }
  if (navigation.action === NotificationNavigationAction.ROUTE) {
    const id = safeTargetId(navigation.routeId);
    return id ? doc(db, 'routes', id) : null;
  }
  if (navigation.action === NotificationNavigationAction.TRIP) {
    const id = safeTargetId(navigation.tripId);
    return id ? doc(db, 'trips', id) : null;
  }
  if (navigation.action === NotificationNavigationAction.COMMENT) {
    const collectionName = CONTENT_COLLECTIONS[navigation.parentType];
    const parentId = safeTargetId(navigation.parentId);
    const commentId = safeTargetId(navigation.commentId);
    if (!collectionName || !parentId) return null;
    return commentId
      ? doc(db, collectionName, parentId, 'comments', commentId)
      : doc(db, collectionName, parentId);
  }
  return null;
}

/**
 * Re-checks the canonical target immediately before opening a social alert.
 * Public rules intentionally hide held content, so permission-denied is kept as
 * an ambiguous unavailable state rather than guessing that it was deleted.
 */
export async function resolveNotificationTargetAvailability(notification) {
  const targetRef = notificationTargetRef(notification);
  if (!targetRef) return { available: false, reason: 'deleted' };
  try {
    const snapshot = await getDoc(targetRef);
    if (!snapshot.exists()) return { available: false, reason: 'deleted' };
    const status = String(snapshot.data()?.status || '').trim().toLowerCase();
    if (status === 'active') return { available: true, reason: 'active' };
    if (HELD_TARGET_STATUSES.has(status)) return { available: false, reason: 'held' };
    return { available: false, reason: 'unavailable' };
  } catch (error) {
    const code = String(error?.code || '').replace(/^firestore\//u, '');
    if (code === 'permission-denied') return { available: false, reason: 'unavailable' };
    const retryable = new Error('Notification target availability could not be checked.');
    retryable.code = code || 'unavailable';
    retryable.reason = 'retryable';
    retryable.cause = error;
    throw retryable;
  }
}

export function buildNotificationPageQuery(userId, channel, options = {}) {
  const pageSize = Math.min(
    NOTIFICATION_PAGE_SIZE,
    Math.max(1, Number(options.pageSize || NOTIFICATION_PAGE_SIZE))
  );
  const constraints = [
    where('schemaVersion', '==', NOTIFICATION_SCHEMA_VERSION),
    where('channel', '==', channel),
    ...getNotificationFilterPredicates(channel, options.filter)
      .map((predicate) => where(...predicate)),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];
  if (options.cursor) constraints.splice(constraints.length - 1, 0, startAfter(options.cursor));
  return query(notificationsRef(userId), ...constraints);
}

export function mapNotificationSnapshot(entry) {
  return normalizeNotification(entry.id, entry.data());
}

function pageFromSnapshot(snapshot, pageSize = NOTIFICATION_PAGE_SIZE) {
  const docs = snapshot.docs || [];
  return {
    items: docs.map(mapNotificationSnapshot),
    cursor: docs.length ? docs[docs.length - 1] : null,
    hasMore: docs.length === pageSize,
  };
}

export async function getNotificationPage(userId, channel, options = {}) {
  const pageSize = Math.min(
    NOTIFICATION_PAGE_SIZE,
    Math.max(1, Number(options.pageSize || NOTIFICATION_PAGE_SIZE))
  );
  const snapshot = await getDocs(buildNotificationPageQuery(userId, channel, {
    ...options,
    pageSize,
  }));
  return pageFromSnapshot(snapshot, pageSize);
}

export function subscribeToNotificationPage(userId, channel, onPage, onError, options = {}) {
  return onSnapshot(
    buildNotificationPageQuery(userId, channel, options),
    (snapshot) => onPage(pageFromSnapshot(snapshot)),
    onError
  );
}

export function mapNotificationState(data = {}) {
  return {
    personalUnread: Math.max(0, Number(data.personalUnread || 0)),
    adminUnread: Math.max(0, Number(data.adminUnread || 0)),
  };
}

export function subscribeToNotificationState(userId, onState, onError) {
  return onSnapshot(
    notificationStateRef(userId),
    (snapshot) => onState(mapNotificationState(snapshot.exists() ? snapshot.data() : {})),
    onError
  );
}

export async function getNotificationState(userId) {
  const snapshot = await getDoc(notificationStateRef(userId));
  return mapNotificationState(snapshot.exists() ? snapshot.data() : {});
}

export async function getNotificationById(userId, notificationId) {
  const snapshot = await getDoc(notificationRef(userId, notificationId));
  if (!snapshot.exists()) return null;
  return mapNotificationSnapshot(snapshot);
}

export const setNotificationRead = (notificationId, read = true) => (
  call('setNotificationRead', { notificationId, read })
);

export const deleteNotificationById = (notificationId) => (
  call('deleteNotification', { notificationId })
);

export const markNotificationChannelRead = (channel) => (
  call('markAllNotificationsRead', { channel })
);

export const clearNotificationChannel = (channel) => (
  call('clearNotifications', { channel })
);

// Feature-local compatibility exports for callers that predate schema v2.
export const markNotificationAsRead = async (_userId, notificationId, read = true) => {
  await setNotificationRead(notificationId, read);
};

export const deleteNotification = async (_userId, notificationId) => {
  await deleteNotificationById(notificationId);
};

export const clearAllNotifications = async (_userId, channel = NotificationChannel.PERSONAL) => {
  const result = await clearNotificationChannel(channel);
  return Number(result?.deleted || 0);
};

export const getNotifications = async (userId, options = {}) => {
  const page = await getNotificationPage(
    userId,
    options.channel || NotificationChannel.PERSONAL,
    options
  );
  return page.items;
};

export const getUnreadCount = async (userId, channel = NotificationChannel.PERSONAL) => {
  const state = await getNotificationState(userId);
  return channel === NotificationChannel.ADMIN ? state.adminUnread : state.personalUnread;
};

export const subscribeToNotifications = (userId, callback, errorCallback, options = {}) => (
  subscribeToNotificationPage(
    userId,
    options.channel || NotificationChannel.PERSONAL,
    (page) => callback(page.items),
    errorCallback,
    options
  )
);
