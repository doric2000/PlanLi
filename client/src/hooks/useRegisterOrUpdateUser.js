import { useCallback } from 'react';
import { db } from '../config/firebase';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';

/**
 * Adds or updates a user in Firestore
 * @param {Object} user - Firebase user object
 * @param {Object} extraData - Any extra data to save (e.g. displayName, photoURL)
 */
export function useRegisterOrUpdateUser() {
  return useCallback(async (user, extraData = {}) => {
    if (!user?.uid || !user?.email) return;
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: extraData.displayName || user.displayName || '',
      createdAt: serverTimestamp(),
      photoURL: extraData.photoURL || user.photoURL || null,
      ...extraData,
    }, { merge: true });
  }, []);
}
