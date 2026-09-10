import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useImagePicker } from '../../../hooks/useImagePicker';
import { useProfilePhotoJobs } from '../../operations/ProfilePhotoContext';
import { TERMINAL_STATES } from '../../operations/operationModel';

export function useProfilePhoto({ uid, updateLocalUserData }) {
  const { jobs, enqueue, lastSaved } = useProfilePhotoJobs();
  const { pickImage } = useImagePicker({ aspect: [1, 1], quality: 1, processOnSelect: false });
  const uploading = jobs.some((job) => job.ownerUid === uid && !TERMINAL_STATES.has(job.status));
  useEffect(() => {
    // The profile mounts before its user snapshot arrives. Two missing IDs
    // must not be treated as a matching, completed photo upload.
    if (!uid || lastSaved?.ownerUid !== uid || !lastSaved?.asset?.feed?.url) return;
    updateLocalUserData?.({ photoURL: lastSaved.asset.feed.url, photoMedia: lastSaved.asset });
  }, [lastSaved, uid, updateLocalUserData]);
  const onPickImage = useCallback(() => {
    if (uploading) return;
    pickImage(async (uri) => {
      if (!uri) return;
      try {
        if (!enqueue) throw new Error('Photo queue unavailable');
        await enqueue(uri);
      } catch {
        Alert.alert('לא הצלחנו להתחיל את ההעלאה', 'בדקו שיש מקום פנוי במכשיר ונסו לבחור את התמונה שוב.');
      }
    });
  }, [enqueue, pickImage, uploading]);
  return { onPickImage, uploading };
}
export default useProfilePhoto;
