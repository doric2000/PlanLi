import { useCallback, useRef, useState } from 'react';

import { useImagePickerWithUpload } from './useImagePickerWithUpload';

export default function useReviewedImagePicker(options = {}) {
  const picker = useImagePickerWithUpload({ ...options, processOnSelect: false });
  const [reviewUris, setReviewUris] = useState([]);
  const completionRef = useRef(null);

  const beginReview = useCallback((uris, completion) => {
    if (!Array.isArray(uris) || !uris.length) return;
    completionRef.current = completion;
    setReviewUris(uris);
  }, []);

  const pickImagesForReview = useCallback(async ({ limit = 5, onComplete } = {}) => {
    const uris = await picker.pickImages({ limit });
    beginReview(uris, onComplete);
  }, [beginReview, picker.pickImages]);

  const pickOneForReview = useCallback((onComplete) => {
    picker.pickImage((uri) => {
      if (uri) beginReview([uri], (reviewedUris) => onComplete?.(reviewedUris?.[0] || null));
    });
  }, [beginReview, picker.pickImage]);

  const cancelReview = useCallback(() => {
    completionRef.current = null;
    setReviewUris([]);
  }, []);

  const completeReview = useCallback(async (uris) => {
    const completion = completionRef.current;
    if (completion) await completion(uris || []);
    completionRef.current = null;
    setReviewUris([]);
  }, []);

  return {
    ...picker,
    cancelReview,
    completeReview,
    pickImagesForReview,
    pickOneForReview,
    reviewUris,
  };
}
