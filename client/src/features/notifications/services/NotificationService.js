/**
 * NotificationService.js
 * 
 * Service layer for managing notifications in Firestore.
 * Handles all Firebase operations related to notifications.
 * Follows the application's existing patterns for Firebase interactions.
 */

import { db } from '../../../config/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { createNotification, isValidNotification } from '../models/NotificationModel';

/**
 * Get the notifications collection reference for a user
 * 
 * @param {string} userId - User ID
 * @returns {CollectionReference} Firestore collection reference
 */
const getNotificationsCollectionRef = (userId) => {
  return collection(db, 'users', userId, 'notifications');
};

/**
 * Calculate if a notification should be sent based on the current count
 * Uses smart batching: 1, 10, 20, 30...90, 100, 200, 300...
 * 
 * @param {number} currentCount - Current number of interactions
 * @returns {boolean} True if notification should be sent
 */
export const shouldNotify = (currentCount) => {
  if (currentCount <= 0) return false;

  // Always notify on first interaction
  if (currentCount === 1) return true;

  // For counts 10-99: notify every 10 (10, 20, 30, 40...)
  if (currentCount < 100) {
    return currentCount % 10 === 0;
  }

  // For counts 100-999: notify every 100 (100, 200, 300...)
  if (currentCount < 1000) {
    return currentCount % 100 === 0;
  }

  // For counts 1000+: notify every 1000 (1000, 2000, 3000...)
  return currentCount % 1000 === 0;
};

/**
 * Get the batch threshold for a given count
 * 
 * @param {number} count - Current count
 * @returns {number} The batch threshold
 */
export const getBatchThreshold = (count) => {
  if (count === 1) return 1;
  if (count < 100) return Math.floor(count / 10) * 10;
  if (count < 1000) return Math.floor(count / 100) * 100;
  return Math.floor(count / 1000) * 1000;
};

/**
 * Create a new notification in Firestore
 * 
 * @param {Object} notificationData - Notification data (see NotificationModel)
 * @returns {Promise<string>} The created notification document ID
 * @throws {Error} If validation fails or Firestore operation fails
 */
export const createNotificationInFirestore = async (notificationData) => {
  try {
    // Create notification object with validation
    const notification = createNotification(notificationData);

    if (!isValidNotification(notification)) {
      throw new Error('Invalid notification data');
    }

    // Get user's notifications collection
    const notificationsRef = getNotificationsCollectionRef(notification.userId);

    // Add timestamp as server timestamp for consistency
    const notificationWithServerTime = {
      ...notification,
      timestamp: serverTimestamp(),
    };

    // Add document to Firestore
    const docRef = await addDoc(notificationsRef, notificationWithServerTime);

    console.log('Notification created:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Update an existing notification (e.g., to update the actor or count)
 * 
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification document ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export const updateNotification = async (userId, notificationId, updates) => {
  try {
    const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);

    await updateDoc(notificationRef, {
      ...updates,
      timestamp: serverTimestamp(), // Update timestamp
    });

    console.log('Notification updated:', notificationId);
  } catch (error) {
    console.error('Error updating notification:', error);
    throw error;
  }
};

/**
 * Mark a notification as read
 * 
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification document ID
 * @returns {Promise<void>}
 */
export const markNotificationAsRead = async (userId, notificationId) => {
  try {
    const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
    await updateDoc(notificationRef, { isRead: true });
    console.log('Notification marked as read:', notificationId);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

/**
 * Delete a single notification
 * 
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification document ID
 * @returns {Promise<void>}
 */
export const deleteNotification = async (userId, notificationId) => {
  try {
    const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
    await deleteDoc(notificationRef);
    console.log('Notification deleted:', notificationId);
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};

/**
 * Clear all notifications for a user
 * Uses batched writes for efficiency
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of notifications deleted
 */
export const clearAllNotifications = async (userId) => {
  try {
    const notificationsRef = getNotificationsCollectionRef(userId);
    const q = query(notificationsRef);
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('No notifications to clear');
      return 0;
    }

    // Use batched writes (max 500 per batch)
    const batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    let batchIndex = 0;

    snapshot.docs.forEach((document) => {
      currentBatch.delete(document.ref);
      operationCount++;

      // Firestore batch limit is 500
      if (operationCount === 500) {
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
        batchIndex++;
      }
    });

    // Add the last batch if it has operations
    if (operationCount > 0) {
      batches.push(currentBatch);
    }

    // Commit all batches
    await Promise.all(batches.map((batch) => batch.commit()));

    console.log(`Cleared ${snapshot.size} notifications in ${batches.length} batch(es)`);
    return snapshot.size;
  } catch (error) {
    console.error('Error clearing notifications:', error);
    throw error;
  }
};

/**
 * Get all notifications for a user (one-time fetch)
 * 
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of notifications to fetch
 * @param {boolean} options.unreadOnly - Fetch only unread notifications
 * @returns {Promise<Array>} Array of notification objects with IDs
 */
export const getNotifications = async (userId, options = {}) => {
  try {
    const { limit = 50, unreadOnly = false } = options;

    const notificationsRef = getNotificationsCollectionRef(userId);
    let q = query(notificationsRef, orderBy('timestamp', 'desc'));

    if (unreadOnly) {
      q = query(notificationsRef, where('isRead', '==', false), orderBy('timestamp', 'desc'));
    }

    const snapshot = await getDocs(q);

    const notifications = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Convert Firestore Timestamp to JavaScript Date
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
      };
    });

    return notifications.slice(0, limit);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }
};

/**
 * Get count of unread notifications
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>} Count of unread notifications
 */
export const getUnreadCount = async (userId) => {
  try {
    const notificationsRef = getNotificationsCollectionRef(userId);
    const q = query(notificationsRef, where('isRead', '==', false));
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

/**
 * Subscribe to real-time notifications updates
 * 
 * @param {string} userId - User ID
 * @param {Function} callback - Callback function to receive notifications
 * @param {Function} errorCallback - Callback for errors
 * @returns {Function} Unsubscribe function
 */
export const subscribeToNotifications = (userId, callback, errorCallback) => {
  try {
    const notificationsRef = getNotificationsCollectionRef(userId);
    const q = query(notificationsRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifications = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Convert Firestore Timestamp to JavaScript Date
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
          };
        });
        callback(notifications);
      },
      (error) => {
        console.error('Error in notifications subscription:', error);
        if (errorCallback) errorCallback(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to notifications:', error);
    throw error;
  }
};

/**
 * Check if a similar notification already exists for the same post
 * (used to prevent duplicate notifications for the same interaction type)
 * 
 * @param {string} userId - User ID
 * @param {string} postId - Post ID
 * @param {string} type - Notification type
 * @param {number} batchThreshold - The batch threshold to check for
 * @returns {Promise<Object|null>} Existing notification or null
 */
export const findExistingNotification = async (userId, postId, type, batchThreshold) => {
  try {
    const notificationsRef = getNotificationsCollectionRef(userId);
    const q = query(
      notificationsRef,
      where('postId', '==', postId),
      where('type', '==', type),
      where('batchThreshold', '==', batchThreshold)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
      };
    }

    return null;
  } catch (error) {
    console.error('Error finding existing notification:', error);
    return null;
  }
};
