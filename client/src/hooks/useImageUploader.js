import { useState, useCallback, useMemo, useRef } from 'react';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { randomUUID } from 'expo-crypto';
import { storage, auth } from '../config/firebase';

const STAGING_IMAGE_METADATA = {
  contentType: 'image/jpeg',
  cacheControl: 'private,max-age=0,no-store',
};

export const MEDIA_UPLOAD_STALLED_CODE = 'media/upload-stalled';

function stalledUploadError() {
  const error = new Error('The image upload stopped making progress.');
  error.code = MEDIA_UPLOAD_STALLED_CODE;
  error.details = { retryable: true, publishStage: 'uploading' };
  return error;
}

/**
 * Upload Strategy Interface
 * @typedef {Object} UploadStrategy
 * @property {Function} upload - Upload function (blob, path, metadata, onProgress, options) => Promise<string|null>
 * @property {Function} generatePath - Path generator (storagePath, userId) => string
 */

/**
 * Firebase Upload Strategy - Default implementation
 * Implements the Strategy Pattern for uploading to Firebase Storage
 */
export const FirebaseUploadStrategy = {
  /**
   * Upload a blob to Firebase Storage
   * @param {Blob} blob - The image blob to upload
   * @param {string} path - The storage path
   * @returns {Promise<string|null>} The download URL when requested
   */
  upload: async (blob, path, metadata = {}, onProgress, options = {}) => {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      ...STAGING_IMAGE_METADATA,
      ...metadata,
      contentType:
        metadata.contentType || blob?.type || STAGING_IMAGE_METADATA.contentType,
    });
    const stallTimeoutMs = Number(options.stallTimeoutMs || 0);
    let stallTimer = null;
    let uploadStalled = false;
    let transferred = 0;
    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const armStallTimer = () => {
      clearStallTimer();
      if (stallTimeoutMs > 0) {
        stallTimer = setTimeout(() => {
          uploadStalled = true;
          uploadTask.cancel();
        }, stallTimeoutMs);
      }
    };
    const snapshot = await new Promise((resolve, reject) => {
      armStallTimer();
      uploadTask.on(
        'state_changed',
        (nextSnapshot) => {
          const total = Number(nextSnapshot.totalBytes || 0);
          const nextTransferred = Number(nextSnapshot.bytesTransferred || 0);
          if (nextTransferred > transferred) {
            transferred = nextTransferred;
            armStallTimer();
          }
          if (total > 0 && typeof onProgress === 'function') {
            onProgress(nextTransferred / total);
          }
        },
        (error) => {
          clearStallTimer();
          reject(uploadStalled ? stalledUploadError() : error);
        },
        () => {
          clearStallTimer();
          resolve(uploadTask.snapshot);
        }
      );
    });
    return options.resolveDownloadUrl === false ? null : getDownloadURL(snapshot.ref);
  },

  /**
   * Generate a unique storage path
   * @param {string} basePath - Base storage path
   * @param {string} userId - User ID
   * @returns {string} Full storage path
   */
  generatePath: (basePath, userId) => {
    return `${basePath}/${userId}/${randomUUID()}.jpg`;
  },

  /**
   * Get current user ID
   * @returns {string} User ID or 'anonymous'
   */
  getUserId: () => auth.currentUser?.uid || 'anonymous',

  remove: async (path) => {
    if (!path) return;
    try {
      await deleteObject(ref(storage, path));
    } catch (error) {
      if (error?.code !== 'storage/object-not-found') throw error;
    }
  },
};

/**
 * Uploader Options
 * @typedef {Object} UploaderOptions
 * @property {string} storagePath - Base path in storage
 * @property {UploadStrategy} strategy - Upload strategy to use
 * @property {Function} getUserId - Function to get current user ID
 */

/**
 * Default uploader options
 */
const DEFAULT_OPTIONS = {
  storagePath: 'media-staging',
  strategy: FirebaseUploadStrategy,
};

/**
 * Image Uploader Hook - Single Responsibility: Only handles image uploading
 * 
 * SOLID Principles Applied:
 * - S: Only responsible for uploading images
 * - O: Open for extension via strategy pattern
 * - D: Depends on abstractions (UploadStrategy), not concretions
 * 
 * @param {UploaderOptions} options - Configuration options
 * @returns {Object} Hook state and upload functions
 */
export const useImageUploader = (options = {}) => {
  const config = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const activeUploadsRef = useRef(0);

  /**
   * Convert URI to Blob
   * @param {string} uri - Image URI
   * @returns {Promise<Blob>} Image blob
   */
  const uriToBlob = useCallback(async (uri) => {
    const response = await fetch(uri);
    return response.blob();
  }, []);

  /**
   * Upload an image to storage
   * @param {string} uri - Image URI to upload
   * @returns {Promise<string|null>} The download URL or null if failed
   */
  const uploadImageDetailed = useCallback(async (uri, details = {}) => {
    if (!uri) return null;

    activeUploadsRef.current += 1;
    if (activeUploadsRef.current === 1) {
      setUploading(true);
      setUploadError(null);
      setUploadProgress(0);
    }

    let blob = null;
    let path = null;
    const shouldRollbackGeneratedPath = !details.path;
    try {
      // Convert URI to blob
      blob = await uriToBlob(uri);
      setUploadProgress(30);
      details.onProgress?.(0.3);

      // Generate path using strategy
      const userId = config.strategy.getUserId?.() || 'anonymous';
      path =
        details.path ||
        config.strategy.generatePath(config.storagePath, userId);
      setUploadProgress(50);
      details.onProgress?.(0.5);

      // Upload using strategy
      const downloadUrl = await config.strategy.upload(blob, path, {
        contentType: 'image/jpeg',
        cacheControl: STAGING_IMAGE_METADATA.cacheControl,
        customMetadata: {
          ownerUid: userId,
          variant: details.variant || 'staging',
          ...(details.width ? { width: String(details.width) } : {}),
          ...(details.height ? { height: String(details.height) } : {}),
        },
      }, (ratio) => {
        setUploadProgress(50 + Math.round(ratio * 45));
        details.onProgress?.(0.5 + ratio * 0.45);
      }, {
        resolveDownloadUrl: details.resolveDownloadUrl !== false,
        stallTimeoutMs: details.stallTimeoutMs,
      });
      if (
        details.resolveDownloadUrl !== false &&
        (typeof downloadUrl !== 'string' || !downloadUrl)
      ) {
        throw new Error('Image upload did not return a download URL.');
      }
      setUploadProgress(100);
      details.onProgress?.(1);

      return {
        url: downloadUrl,
        path,
        width: details.width || null,
        height: details.height || null,
        bytes: Number.isFinite(blob?.size) ? blob.size : null,
        contentType: 'image/jpeg',
      };
    } catch (error) {
      console.info('media_upload_failed', { code: String(error?.code || 'unknown') });
      setUploadError(error);
      if (
        path &&
        shouldRollbackGeneratedPath &&
        typeof config.strategy.remove === 'function'
      ) {
        const cleanup = config.strategy.remove(path).catch((cleanupError) => {
          console.warn('media_upload_rollback_failed', {
            code: String(cleanupError?.code || 'unknown'),
          });
        });
        if (![
          MEDIA_UPLOAD_STALLED_CODE,
          'storage/retry-limit-exceeded',
          'storage/unknown',
        ].includes(String(error?.code || ''))) {
          await cleanup;
        }
      }
      throw error;
    } finally {
      if (blob && typeof blob.close === 'function') {
        blob.close();
      }
      activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
      if (activeUploadsRef.current === 0) {
        setUploading(false);
      }
    }
  }, [config.storagePath, config.strategy, uriToBlob]);

  const uploadImage = useCallback(
    async (uri) => {
      const result = await uploadImageDetailed(uri);
      return result?.url || null;
    },
    [uploadImageDetailed]
  );

  const removeUploadedImage = useCallback(
    async (path) => {
      if (!path || typeof config.strategy.remove !== 'function') return;
      await config.strategy.remove(path);
    },
    [config.strategy]
  );

  /**
   * Reset upload state
   */
  const resetUpload = useCallback(() => {
    setUploadError(null);
    setUploadProgress(0);
  }, []);

  return {
    // State
    uploading,
    uploadError,
    uploadProgress,

    // Actions
    uploadImage,
    uploadImageDetailed,
    removeUploadedImage,
    resetUpload,
  };
};

export default useImageUploader;
