/**
 * useUnreadCount.js
 * 
 * Lightweight hook to get the count of unread notifications.
 * Used for badge counters in navigation without loading all notification data.
 */

import { useState, useEffect } from 'react';
import { auth } from '../../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../../config/firebase';

/**
 * Custom hook to track unread notification count in real-time
 * 
 * @returns {number} Count of unread notifications
 */
export const useUnreadCount = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }

    const notificationsRef = collection(db, 'users', currentUser.uid, 'notifications');
    const q = query(notificationsRef, where('isRead', '==', false));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setUnreadCount(snapshot.size);
      },
      (error) => {
        console.error('Error tracking unread count:', error);
        setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  return unreadCount;
};

export default useUnreadCount;
