import { useState, useCallback, useMemo } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../config/firebase';

/**
 * Upload Strategy Interface
 * @typedef {Object} UploadStrategy
 * @property {Function} upload - Upload function (blob, path) => Promise<string>
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
   * @returns {Promise<string>} The download URL
   */
  upload: async (blob, path) => {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  },

  /**
   * Generate a unique storage path
   * @param {string} basePath - Base storage path
   * @param {string} userId - User ID
   * @returns {string} Full storage path
   */
  generatePath: (basePath, userId) => {
    return `${basePath}/${userId}/${Date.now()}.jpg`;
  },

  /**
   * Get current user ID
   * @returns {string} User ID or 'anonymous'
   */
  getUserId: () => auth.currentUser?.uid || 'anonymous',
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
  storagePath: 'images',
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
  const uploadImage = useCallback(async (uri) => {
    if (!uri) return null;

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      // Convert URI to blob
      const blob = await uriToBlob(uri);
      setUploadProgress(30);

      // Generate path using strategy
      const userId = config.strategy.getUserId?.() || 'anonymous';
      const path = config.strategy.generatePath(config.storagePath, userId);
      setUploadProgress(50);

      // Upload using strategy
      const downloadUrl = await config.strategy.upload(blob, path);
      setUploadProgress(100);

      return downloadUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError(error);
      throw error;
    } finally {
      setUploading(false);
    }
  }, [config.storagePath, config.strategy, uriToBlob]);

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
    resetUpload,
  };
};

export default useImageUploader;
