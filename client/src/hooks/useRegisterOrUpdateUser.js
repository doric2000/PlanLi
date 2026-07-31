import { useCallback } from 'react';
import { db } from '../config/firebase';
import { setDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Adds or updates a user in Firestore
 * @param {Object} user - Firebase user object
 * @param {Object} extraData - Any extra data to save (e.g. displayName, photoURL)
 */
export function useRegisterOrUpdateUser() {
  return useCallback(async (user, extraData = {}) => {
    if (!user?.uid || !user?.email) return;
    const allowedExtraData = {
      displayName: extraData.displayName || user.displayName || '',
      photoURL: extraData.photoURL || user.photoURL || null,
    };
    const userRef = doc(db, 'users', user.uid);
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      await setDoc(userRef, {
        ...allowedExtraData,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return;
    }

    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      ...allowedExtraData,
      createdAt: serverTimestamp(),
    });
  }, []);
}
