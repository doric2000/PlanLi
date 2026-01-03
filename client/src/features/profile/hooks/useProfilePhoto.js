import { useCallback } from 'react';
import { Alert } from 'react-native';
import { updateProfile } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';

import { auth, db } from '../../../config/firebase';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';

const IMAGE_PICKER_CONFIG = {
  storagePath: 'profilePicture',
  aspect: [1, 1],
  quality: 0.7,
};

export function useProfilePhoto({ uid, user, userData, updateLocalUserData }) {
  const { pickImage, uploadImage, uploading } = useImagePickerWithUpload(IMAGE_PICKER_CONFIG);

  const handleProfilePictureUpload = useCallback(
    async (uri) => {
      if (!uri || !auth.currentUser || !uid) return;

      try {
        if (userData?.photoURL) {
          try {
            const storage = getStorage();
            const match = decodeURIComponent(userData.photoURL).match(/\/o\/(.+)\?/);
            if (match && match[1]) {
              const oldPath = match[1];
              const oldRef = storageRef(storage, oldPath);
              await deleteObject(oldRef);
            }
          } catch (err) {
            console.warn('Failed to delete old profile photo:', err);
          }
        }

        const downloadURL = await uploadImage(uri);
        if (!downloadURL) return;

        await updateProfile(auth.currentUser, { photoURL: downloadURL });

        const uRef = doc(db, 'users', uid);
        const uDoc = await getDoc(uRef);

        if (uDoc.exists()) {
          await updateDoc(uRef, {
            photoURL: downloadURL,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(
            uRef,
            {
              uid,
              email: user?.email || '',
              displayName: user?.displayName || userData?.displayName || 'Traveler',
              photoURL: downloadURL,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        if (typeof updateLocalUserData === 'function') {
          updateLocalUserData({ photoURL: downloadURL });
        }

        Alert.alert('Success', 'Profile picture updated!');
      } catch (error) {
        console.error('Upload failed', error);
        Alert.alert('Error', 'Failed to upload profile picture.');
      }
    },
    [uid, userData?.photoURL, user, uploadImage, updateLocalUserData]
  );

  const onPickImage = useCallback(() => {
    pickImage(handleProfilePictureUpload);
  }, [pickImage, handleProfilePictureUpload]);

  return {
    onPickImage,
    uploading,
  };
}

export default useProfilePhoto;
