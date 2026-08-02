import {
  collection,
  getCountFromServer,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import {
  clearNotifications,
  deleteNotification as deleteNotificationCallable,
  setNotificationRead,
} from '../../../services/SocialService';

const notificationsRef = (userId) =>
  collection(db, 'users', userId, 'notifications');

const mapNotification = (entry) => {
  const data = entry.data();
  const createdAt = data.createdAt;
  return {
    id: entry.id,
    ...data,
    postType: data.target?.type,
    postId: data.target?.id,
    postTitle: data.target?.title || '',
    actorName: data.actorPreview?.displayName || 'Traveler',
    actorAvatar: data.actorPreview?.photoURL || null,
    count: 1,
    timestamp: createdAt?.toDate ? createdAt.toDate() : createdAt,
  };
};

export const markNotificationAsRead = async (_userId, notificationId) => {
  await setNotificationRead(notificationId, true);
};

export const deleteNotification = async (_userId, notificationId) => {
  await deleteNotificationCallable(notificationId);
};

export const clearAllNotifications = async () => {
  const result = await clearNotifications();
  return Number(result?.deleted || 0);
};

export const getNotifications = async (userId, options = {}) => {
  const pageSize = Math.min(50, Math.max(1, Number(options.limit || 50)));
  const constraints = [];
  if (options.unreadOnly) constraints.push(where('isRead', '==', false));
  constraints.push(orderBy('createdAt', 'desc'), firestoreLimit(pageSize));
  const snapshot = await getDocs(query(notificationsRef(userId), ...constraints));
  return snapshot.docs.map(mapNotification);
};

export const getUnreadCount = async (userId) => {
  try {
    const snapshot = await getCountFromServer(query(
      notificationsRef(userId),
      where('isRead', '==', false)
    ));
    return snapshot.data().count;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

export const subscribeToNotifications = (userId, callback, errorCallback) =>
  onSnapshot(
    query(
      notificationsRef(userId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(50)
    ),
    (snapshot) => callback(snapshot.docs.map(mapNotification)),
    (error) => {
      console.error('Error in notifications subscription:', error);
      errorCallback?.(error);
    }
  );
