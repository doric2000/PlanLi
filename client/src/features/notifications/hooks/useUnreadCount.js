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

  console.log('🔍 useUnreadCount hook - currentUser:', currentUser?.uid);

  useEffect(() => {
    if (!currentUser) {
      console.log('❌ No current user in useUnreadCount');
      setUnreadCount(0);
      return;
    }

    console.log('Setting up unread count listener for user:', currentUser.uid);
    const notificationsRef = collection(db, 'users', currentUser.uid, 'notifications');
    const q = query(notificationsRef, where('isRead', '==', false));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log('Unread notifications count:', snapshot.size);
        setUnreadCount(snapshot.size);
      },
      (error) => {
        console.error('Error tracking unread count:', error);
        setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  console.log('useUnreadCount returning:', unreadCount);
  return unreadCount;
};

export default useUnreadCount;
