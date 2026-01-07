/**
 * useNotifications.js
 * 
 * Custom hook for real-time notification updates.
 * Follows the pattern established by useRecommendations and other data-fetching hooks.
 * 
 * Features:
 * - Real-time Firestore listener
 * - Pull-to-refresh support
 * - Loading states
 * - Error handling
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../../../config/firebase';
import { subscribeToNotifications, getNotifications } from '../services/NotificationService';

/**
 * Custom hook to fetch and subscribe to real-time notifications
 * 
 * @returns {Object} Object containing:
 * - notifications: Array of notification objects
 * - loading: Boolean indicating initial load
 * - refreshing: Boolean indicating refresh in progress
 * - error: Error object if any
 * - refresh: Function to manually refresh notifications
 * - unreadCount: Number of unread notifications
 */
export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const currentUser = auth.currentUser;

  // Calculate unread count
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToNotifications(
      currentUser.uid,
      (fetchedNotifications) => {
        setNotifications(fetchedNotifications);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.error('Error in notifications subscription:', err);
        setError(err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  // Manual refresh function for pull-to-refresh
  const refresh = useCallback(async () => {
    if (!currentUser) return;

    setRefreshing(true);
    setError(null);

    try {
      const fetchedNotifications = await getNotifications(currentUser.uid);
      setNotifications(fetchedNotifications);
    } catch (err) {
      console.error('Error refreshing notifications:', err);
      setError(err);
    } finally {
      setRefreshing(false);
    }
  }, [currentUser]);

  return {
    notifications,
    loading,
    refreshing,
    error,
    refresh,
    unreadCount,
  };
};

export default useNotifications;
