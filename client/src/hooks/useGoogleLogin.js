import { useCallback } from 'react';
import { auth, db } from '../config/firebase';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRegisterOrUpdateUser } from './useRegisterOrUpdateUser';

/**
 * Hook to handle Google login and Firestore user creation
 * @param {Function} navigationReplace - navigation.replace function
 * @returns {Function} handleGoogleResponse
 */
export function useGoogleLogin(navigationReplace) {
  const registerOrUpdateUser = useRegisterOrUpdateUser();

  return useCallback(async (response) => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      try {
        const userCredential = await signInWithCredential(auth, credential);
        const user = userCredential.user;
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          await registerOrUpdateUser(user, {
            displayName: user.displayName || user.email.split('@')[0],
            photoURL: user.photoURL,
            trips: 0,
            reviews: 0,
            credibilityScore: 10,
            isExpert: false,
          });
        }
        navigationReplace('Main');
      } catch (err) {
        throw err;
      }
    }
  }, [registerOrUpdateUser, navigationReplace]);
}
