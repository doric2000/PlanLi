import { useCallback } from 'react';

import { prepareMedia } from '../services/MediaService';
import { useImagePicker } from './useImagePicker';
import {
  FirebaseUploadStrategy,
  useImageUploader,
} from './useImageUploader';

const DEFAULT_OPTIONS = {
  aspect: [4, 3],
  quality: 1,
  allowsEditing: true,
  normalizeToAspect: false,
  normalizeAspect: [4, 5],
  normalizeWidth: 2560,
  normalizeHeight: 2560,
  maxLongEdge: 2560,
  normalizeCompress: 0.94,
  processOnSelect: true,
  kind: 'route',
  storagePath: 'media-staging',
  strategy: FirebaseUploadStrategy,
};

/**
 * Run at most two complete image pipelines concurrently while preserving the
 * selection order.
 */
export const uploadUrisWithConcurrency = async (
  uris,
  uploadImage,
  maxConcurrency = 2
) => {
  if (!Array.isArray(uris) || uris.length === 0) return [];
  const results = new Array(uris.length);
  let nextIndex = 0;
  let firstError = null;
  const workerCount = Math.min(Math.max(1, maxConcurrency), uris.length);

  const worker = async () => {
    while (!firstError) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= uris.length) return;
      try {
        results[index] = await uploadImage(uris[index]);
      } catch (error) {
        firstError = firstError || error;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  if (firstError) throw firstError;
  return results;
};

export const useImagePickerWithUpload = (options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const picker = useImagePicker({
    aspect: config.aspect,
    quality: config.quality,
    allowsEditing: config.allowsEditing,
    normalizeToAspect: config.normalizeToAspect,
    normalizeAspect: config.normalizeAspect,
    normalizeWidth: config.normalizeWidth,
    normalizeHeight: config.normalizeHeight,
    maxLongEdge: config.maxLongEdge,
    normalizeCompress: config.normalizeCompress,
    processOnSelect: config.processOnSelect,
  });
  const uploader = useImageUploader({
    storagePath: 'media-staging',
    strategy: config.strategy,
  });

  const uploadImageAsset = useCallback(
    async (uri) => {
      if (!uri) return null;
      let staging = null;
      try {
        staging = await uploader.uploadImageDetailed(uri, {
          variant: 'staging',
        });
        if (!staging?.path) {
          throw new Error('Staging upload did not return a Storage path.');
        }
        const asset = await prepareMedia({
          stagingPath: staging.path,
          kind: config.kind,
        });
        if (
          !asset?.assetId ||
          !asset?.large?.url ||
          !asset?.feed?.url ||
          !asset?.thumb?.url
        ) {
          throw new Error('Media processing returned an incomplete asset.');
        }
        return asset;
      } catch (error) {
        if (staging?.path) {
          await uploader.removeUploadedImage(staging.path).catch(() => {});
        }
        throw error;
      }
    },
    [config.kind, uploader]
  );

  const uploadImageAssets = useCallback(
    async (uris, { limit = 5 } = {}) => {
      if (!Array.isArray(uris) || uris.length === 0) return [];
      const normalizedLimit = Number.isFinite(limit)
        ? Math.max(0, Math.floor(limit))
        : uris.length;
      return uploadUrisWithConcurrency(
        uris.slice(0, normalizedLimit),
        uploadImageAsset,
        2
      );
    },
    [uploadImageAsset]
  );

  const uploadImages = useCallback(
    async (uris) => {
      const assets = await uploadImageAssets(uris);
      return assets.map((asset) => asset.feed.url);
    },
    [uploadImageAssets]
  );

  const pickImages = useCallback(
    async ({ limit = 5 } = {}) => {
      if (typeof document !== 'undefined' && picker.pickMultipleFromWeb) {
        return picker.pickMultipleFromWeb({ selectionLimit: limit });
      }
      if (picker.pickMultipleFromGallery) {
        return picker.pickMultipleFromGallery({ selectionLimit: limit });
      }
      return [];
    },
    [picker]
  );

  const pickAndUpload = useCallback(async () => {
    const uri = await picker.pickFromGallery();
    const asset = uri ? await uploadImageAsset(uri) : null;
    return asset?.feed?.url || null;
  }, [picker, uploadImageAsset]);

  const captureAndUpload = useCallback(async () => {
    const uri = await picker.pickFromCamera();
    const asset = uri ? await uploadImageAsset(uri) : null;
    return asset?.feed?.url || null;
  }, [picker, uploadImageAsset]);

  const pickImageAndUpload = useCallback(
    (onComplete) =>
      picker.pickImage(async (uri) => {
        if (!uri) return;
        try {
          const asset = await uploadImageAsset(uri);
          onComplete?.(asset?.feed?.url || null);
        } catch (error) {
          console.error('Upload after pick failed:', error);
        }
      }),
    [picker, uploadImageAsset]
  );

  const reset = useCallback(() => {
    picker.clearImage();
    uploader.resetUpload();
  }, [picker, uploader]);

  return {
    imageUri: picker.imageUri,
    setImageUri: picker.setImageUri,
    pickerError: picker.error,
    uploading: uploader.uploading,
    uploadError: uploader.uploadError,
    uploadProgress: uploader.uploadProgress,
    pickImage: picker.pickImage,
    pickFromGallery: picker.pickFromGallery,
    pickFromCamera: picker.pickFromCamera,
    clearImage: picker.clearImage,
    uploadImage: async (uri) => (await uploadImageAsset(uri))?.feed?.url || null,
    uploadImageAsset,
    uploadImageAssets,
    uploadImages,
    removeUploadedImage: uploader.removeUploadedImage,
    resetUpload: uploader.resetUpload,
    pickAndUpload,
    captureAndUpload,
    pickImageAndUpload,
    pickImages,
    reset,
  };
};

export default useImagePickerWithUpload;
