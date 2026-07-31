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

import { auth, db } from '../../../config/firebase';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { primeUserDataCache } from '../../../hooks/useUserData';

const IMAGE_PICKER_CONFIG = {
  kind: 'avatar',
  aspect: [1, 1],
  quality: 1,
  normalizeToAspect: true,
  normalizeAspect: [1, 1],
  normalizeWidth: 2560,
  normalizeHeight: 2560,
  normalizeCompress: 0.94,
};

export function useProfilePhoto({ uid, user, userData, updateLocalUserData }) {
  const {
    pickImage,
    uploadImageAsset,
    uploading,
  } = useImagePickerWithUpload(IMAGE_PICKER_CONFIG);

  const handleProfilePictureUpload = useCallback(
    async (uri) => {
      if (!uri || !auth.currentUser || !uid) return;

      let uploadedAsset = null;
      try {
        uploadedAsset = await uploadImageAsset(uri);
        const downloadURL = uploadedAsset?.feed?.url;
        if (!downloadURL) return;

        const uRef = doc(db, 'users', uid);
        const uDoc = await getDoc(uRef);
        const profileFields = {
          photoURL: downloadURL,
          photoMedia: uploadedAsset,
          updatedAt: serverTimestamp(),
        };

        if (uDoc.exists()) {
          await updateDoc(uRef, profileFields);
        } else {
          await setDoc(
            uRef,
            {
              uid,
              email: user?.email || '',
              displayName: user?.displayName || userData?.displayName || 'Traveler',
              ...profileFields,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
        try {
          await updateProfile(auth.currentUser, { photoURL: downloadURL });
        } catch (authUpdateError) {
          console.warn('Firebase Auth photo update failed:', authUpdateError);
        }

        if (typeof updateLocalUserData === 'function') {
          updateLocalUserData({
            photoURL: downloadURL,
            photoMedia: uploadedAsset,
          });
        }
        primeUserDataCache(uid, {
          displayName: userData?.displayName || user?.displayName || 'Traveler',
          photoURL: downloadURL,
          photoMedia: uploadedAsset,
        });

        Alert.alert('Success', 'Profile picture updated!');
      } catch (error) {
        // Unclaimed prepared media is removed by the scheduled server cleanup.
        console.error('Upload failed', error);
        Alert.alert('Error', 'Failed to upload profile picture.');
      }
    },
    [
      uid,
      userData?.displayName,
      user,
      uploadImageAsset,
      updateLocalUserData,
    ]
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
