import { useCallback } from 'react';
import { registerUserDocument } from '../services/ProfileService';

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
    await registerUserDocument(allowedExtraData);
  }, []);
}
