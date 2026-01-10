import { useCallback } from 'react';
import { useImagePicker } from './useImagePicker';
import { useImageUploader, FirebaseUploadStrategy } from './useImageUploader';

/**
 * Combined Options for picker and uploader
 * @typedef {Object} ImagePickerWithUploadOptions
 * @property {number[]} aspect - Aspect ratio [width, height]
 * @property {number} quality - Image quality (0-1)
 * @property {boolean} allowsEditing - Allow image editing
 * @property {string} storagePath - Base path in storage
 * @property {Object} strategy - Upload strategy
 */

/**
 * Default options
 */
const DEFAULT_OPTIONS = {
  // Picker options
  aspect: [4, 3],
  quality: 0.5,
  allowsEditing: true,

  // Optional: normalize to strict aspect/size
  normalizeToAspect: false,
  normalizeAspect: [4, 5],
  normalizeWidth: 1080,
  normalizeHeight: 1350,
  normalizeCompress: 0.9,
  // Uploader options
  storagePath: 'images',
  strategy: FirebaseUploadStrategy,
};

/**
 * Combined Image Picker and Uploader Hook
 * 
 * SOLID Principles Applied:
 * - S: Composes two single-responsibility hooks
 * - O: Open for extension via options
 * - D: Uses dependency injection for strategy
 * 
 * This hook follows the Composition over Inheritance principle,
 * combining useImagePicker and useImageUploader into a unified interface.
 * 
 * @param {ImagePickerWithUploadOptions} options - Configuration options
 * @returns {Object} Combined hook state and functions
 */
export const useImagePickerWithUpload = (options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Compose the two hooks
  const picker = useImagePicker({
    aspect: config.aspect,
    quality: config.quality,
    allowsEditing: config.allowsEditing,
    normalizeToAspect: config.normalizeToAspect,
    normalizeAspect: config.normalizeAspect,
    normalizeWidth: config.normalizeWidth,
    normalizeHeight: config.normalizeHeight,
    normalizeCompress: config.normalizeCompress,
  });

  const uploader = useImageUploader({
    storagePath: config.storagePath,
    strategy: config.strategy,
  });

  /**
   * Pick an image and immediately upload it
   * @returns {Promise<string|null>} Download URL or null
   */
  const pickAndUpload = useCallback(async () => {
    const uri = await picker.pickFromGallery();
    if (uri) {
      return uploader.uploadImage(uri);
    }
    return null;
  }, [picker, uploader]);

  /**
   * Pick from camera and immediately upload
   * @returns {Promise<string|null>} Download URL or null
   */
  const captureAndUpload = useCallback(async () => {
    const uri = await picker.pickFromCamera();
    if (uri) {
      return uploader.uploadImage(uri);
    }
    return null;
  }, [picker, uploader]);

  /**
   * Show picker dialog and upload selected image
   * @param {Function} [onComplete] - Callback with download URL after upload
   * @returns {Promise<string|null>} Download URL or null
   */
  const pickImageAndUpload = useCallback((onComplete) => {
    return picker.pickImage(async (uri) => {
      if (uri) {
        try {
          const downloadUrl = await uploader.uploadImage(uri);
          if (onComplete) onComplete(downloadUrl);
        } catch (error) {
          console.error('Upload after pick failed:', error);
        }
      }
    });
  }, [picker, uploader]);

  /**
   * Clear all state
   */
  const reset = useCallback(() => {
    picker.clearImage();
    uploader.resetUpload();
  }, [picker, uploader]);

  /**
   * Pick up to N images (gallery/web) and return their local URIs.
   * Camera is intentionally not supported for multi-pick.
   *
   * @param {Object} opts
   * @param {number} [opts.limit=5]
   * @returns {Promise<string[]>}
   */
  const pickImages = useCallback(async ({ limit = 5 } = {}) => {
    // Web: file input supports multiple
    if (typeof document !== 'undefined' && picker.pickMultipleFromWeb) {
      return picker.pickMultipleFromWeb({ selectionLimit: limit });
    }
    if (picker.pickMultipleFromGallery) {
      return picker.pickMultipleFromGallery({ selectionLimit: limit });
    }
    return [];
  }, [picker]);

  /**
   * Upload an array of local URIs and return download URLs.
   *
   * @param {string[]} uris
   * @returns {Promise<string[]>}
   */
  const uploadImages = useCallback(async (uris) => {
    if (!Array.isArray(uris) || uris.length === 0) return [];
    const limited = uris.slice(0, 5);
    const results = [];
    for (const uri of limited) {
      // eslint-disable-next-line no-await-in-loop
      const url = await uploader.uploadImage(uri);
      if (url) results.push(url);
    }
    return results;
  }, [uploader]);

  return {
    // Picker state
    imageUri: picker.imageUri,
    setImageUri: picker.setImageUri,
    pickerError: picker.error,

    // Uploader state
    uploading: uploader.uploading,
    uploadError: uploader.uploadError,
    uploadProgress: uploader.uploadProgress,

    // Picker actions
    pickImage: picker.pickImage,
    pickFromGallery: picker.pickFromGallery,
    pickFromCamera: picker.pickFromCamera,
    clearImage: picker.clearImage,

    // Uploader actions
    uploadImage: uploader.uploadImage,
    resetUpload: uploader.resetUpload,

    // Combined actions
    pickAndUpload,
    captureAndUpload,
    pickImageAndUpload,
    reset,

    // Multi-image helpers
    pickImages,
    uploadImages,
  };
};

export default useImagePickerWithUpload;
