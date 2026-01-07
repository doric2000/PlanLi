/**
 * useClearNotifications.js
 * 
 * Hook for clearing notifications with loading state.
 * Provides a clean interface for notification management actions.
 */

import { useState } from 'react';
import { auth } from '../../../config/firebase';
import { 
  clearAllNotifications, 
  markNotificationAsRead,
  deleteNotification 
} from '../services/NotificationService';

/**
 * Custom hook for notification management actions
 * 
 * @returns {Object} Object containing:
 * - clearAll: Function to clear all notifications
 * - markAsRead: Function to mark a notification as read
 * - deleteOne: Function to delete a single notification
 * - clearing: Boolean indicating if clear operation is in progress
 * - error: Error object if any
 */
export const useClearNotifications = () => {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState(null);
  const currentUser = auth.currentUser;

  /**
   * Clear all notifications for the current user
   * 
   * @returns {Promise<number>} Number of notifications cleared
   */
  const clearAll = async () => {
    if (!currentUser) {
      console.warn('No user logged in');
      return 0;
    }

    setClearing(true);
    setError(null);

    try {
      const count = await clearAllNotifications(currentUser.uid);
      console.log(`Cleared ${count} notifications`);
      return count;
    } catch (err) {
      console.error('Error clearing notifications:', err);
      setError(err);
      throw err;
    } finally {
      setClearing(false);
    }
  };

  /**
   * Mark a notification as read
   * 
   * @param {string} notificationId - Notification ID to mark as read
   * @returns {Promise<void>}
   */
  const markAsRead = async (notificationId) => {
    if (!currentUser) {
      console.warn('No user logged in');
      return;
    }

    try {
      await markNotificationAsRead(currentUser.uid, notificationId);
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError(err);
      throw err;
    }
  };

  /**
   * Delete a single notification
   * 
   * @param {string} notificationId - Notification ID to delete
   * @returns {Promise<void>}
   */
  const deleteOne = async (notificationId) => {
    if (!currentUser) {
      console.warn('No user logged in');
      return;
    }

    try {
      await deleteNotification(currentUser.uid, notificationId);
    } catch (err) {
      console.error('Error deleting notification:', err);
      setError(err);
      throw err;
    }
  };

  return {
    clearAll,
    markAsRead,
    deleteOne,
    clearing,
    error,
  };
};

export default useClearNotifications;
