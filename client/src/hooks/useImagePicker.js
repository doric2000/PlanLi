import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Configuration options for the image picker
 * @typedef {Object} ImagePickerOptions
 * @property {number[]} aspect - Aspect ratio for image cropping [width, height]
 * @property {number} quality - Image quality (0-1)
 * @property {boolean} allowsEditing - Whether to allow editing
 */

/**
 * Default configuration for image picker
 */
const DEFAULT_OPTIONS = {
  aspect: [4, 3],
  quality: 0.5,
  allowsEditing: true,
};

/**
 * Image Picker Hook - Single Responsibility: Only handles image selection
 * 
 * SOLID Principles Applied:
 * - S: Only responsible for picking images (not uploading)
 * - O: Open for extension via options, closed for modification
 * - I: Returns only what's needed for image picking
 * 
 * @param {ImagePickerOptions} options - Configuration options
 * @returns {Object} Hook state and picker functions
 */
export const useImagePicker = (options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  const [imageUri, setImageUri] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Request media library permission
   * @returns {Promise<boolean>} Whether permission was granted
   */
  const requestGalleryPermission = useCallback(async () => {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!result.granted) {
      Alert.alert("Permission Required", "Please grant access to your photo library.");
      return false;
    }
    return true;
  }, []);

  /**
   * Request camera permission
   * @returns {Promise<boolean>} Whether permission was granted
   */
  const requestCameraPermission = useCallback(async () => {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    if (!result.granted) {
      Alert.alert("Permission Required", "Please grant access to your camera.");
      return false;
    }
    return true;
  }, []);

  /**
   * Pick an image from the device's photo library
   * @returns {Promise<string|null>} The selected image URI or null
   */
  const pickFromGallery = useCallback(async () => {
    try {
      const hasPermission = await requestGalleryPermission();
      if (!hasPermission) return null;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: config.allowsEditing,
        aspect: config.aspect,
        quality: config.quality,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        setError(null);
        return uri;
      }
      return null;
    } catch (err) {
      console.error('Error picking image:', err);
      setError(err);
      Alert.alert("Error", "Failed to pick image.");
      return null;
    }
  }, [config.allowsEditing, config.aspect, config.quality, requestGalleryPermission]);

  /**
   * Pick multiple images from the device's photo library.
   * Note: Expo ImagePicker does not support editing when selecting multiple.
   *
   * @param {Object} opts
   * @param {number} [opts.selectionLimit=5] - Max number of images to select
   * @returns {Promise<string[]>} Array of selected image URIs
   */
  const pickMultipleFromGallery = useCallback(async ({ selectionLimit = 5 } = {}) => {
    try {
      const hasPermission = await requestGalleryPermission();
      if (!hasPermission) return [];

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit,
        quality: config.quality,
      });

      if (result.canceled) return [];
      const uris = (result.assets || []).map(a => a?.uri).filter(Boolean);
      if (uris.length) {
        setImageUri(uris[0]);
        setError(null);
      }
      return uris;
    } catch (err) {
      console.error('Error picking multiple images:', err);
      setError(err);
      Alert.alert("Error", "Failed to pick images.");
      return [];
    }
  }, [config.quality, requestGalleryPermission]);

  /**
   * Capture an image using the device's camera
   * @returns {Promise<string|null>} The captured image URI or null
   */
  const pickFromCamera = useCallback(async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return null;

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: config.allowsEditing,
        aspect: config.aspect,
        quality: config.quality,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        setError(null);
        return uri;
      }
      return null;
    } catch (err) {
      console.error('Error taking photo:', err);
      setError(err);
      Alert.alert("Error", "Failed to take photo.");
      return null;
    }
  }, [config.allowsEditing, config.aspect, config.quality, requestCameraPermission]);

  /**
   * Handle web file input
   * @param {Function} onSelect - Callback when file is selected
   */
  const pickFromWeb = useCallback((onSelect) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const uri = URL.createObjectURL(file);
        setImageUri(uri);
        setError(null);
        if (onSelect) onSelect(uri);
      }
    };
    input.click();
  }, []);

  /**
   * Handle web file input (multiple)
   * @param {Object} opts
   * @param {number} [opts.selectionLimit=5]
   * @returns {Promise<string[]>}
   */
  const pickMultipleFromWeb = useCallback(({ selectionLimit = 5 } = {}) => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from(e.target.files || []).slice(0, selectionLimit);
        const uris = files.map((file) => URL.createObjectURL(file));
        if (uris.length) {
          setImageUri(uris[0]);
          setError(null);
        }
        resolve(uris);
      };
      input.click();
    });
  }, []);

  /**
   * Show picker dialog (gallery/camera choice on mobile, file picker on web)
   * @param {Function} [onImageSelected] - Optional callback after selection
   * @returns {Promise<string|null>} The selected image URI or null
   */
  const pickImage = useCallback((onImageSelected) => {
    // Web: use file input
    if (Platform.OS === 'web') {
      pickFromWeb(onImageSelected);
      return Promise.resolve(null);
    }

    // Mobile: show choice dialog
    return new Promise((resolve) => {
      Alert.alert("Choose Photo", "Select an option", [
        {
          text: "Upload from Gallery",
          onPress: async () => {
            const uri = await pickFromGallery();
            if (uri && onImageSelected) onImageSelected(uri);
            resolve(uri);
          },
        },
        {
          text: "Use Camera",
          onPress: async () => {
            const uri = await pickFromCamera();
            if (uri && onImageSelected) onImageSelected(uri);
            resolve(uri);
          },
        },
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      ]);
    });
  }, [pickFromGallery, pickFromCamera, pickFromWeb]);

  /**
   * Clear the current image selection
   */
  const clearImage = useCallback(() => {
    setImageUri(null);
    setError(null);
  }, []);

  return {
    // State
    imageUri,
    setImageUri,
    error,

    // Actions
    pickImage,
    pickFromGallery,
    pickMultipleFromGallery,
    pickFromCamera,
    clearImage,

    // Web multiple
    pickMultipleFromWeb,
  };
};

export default useImagePicker;
