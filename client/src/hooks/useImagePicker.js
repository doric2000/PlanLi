import { useState, useCallback } from 'react';
import { Alert, Platform, Image as RNImage } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

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
  // Keep the picker output lossless-ish and perform one predictable JPEG
  // encode after resizing below.
  quality: 1,
  allowsEditing: true,

  // Optional: normalize output to a strict aspect/size (Instagram-like)
  normalizeToAspect: false,
  normalizeAspect: [4, 5],
  normalizeWidth: 1080,
  normalizeHeight: 1350,
  // Non-cropped images (route days/stops) are capped by their long edge.
  maxLongEdge: 2560,
  normalizeCompress: 0.94,
  // Keep a bounded, high-quality staging source; final variants are encoded
  // exactly once by the European media function.
  processOnSelect: true,
};

const revokeObjectUrl = (uri) => {
  if (
    typeof uri === 'string' &&
    uri.startsWith('blob:') &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(uri);
  }
};

export const getImageSize = (uri) => {
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.Image === 'function'
  ) {
    return new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () =>
        resolve({
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        });
      image.onerror = reject;
      image.src = uri;
    });
  }

  return new Promise((resolve, reject) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err)
    );
  });
};

/**
 * Build crop/resize actions without ever enlarging the source image.
 * Exported for focused unit tests.
 */
export const buildImageTransform = (width, height, options = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { actions: [], width, height };
  }

  if (config.normalizeToAspect) {
    const aspectWidth = Number(config.normalizeAspect?.[0]) || 1;
    const aspectHeight = Number(config.normalizeAspect?.[1]) || 1;
    const targetAspect = aspectWidth / aspectHeight;
    const currentAspect = width / height;

    let cropWidth = width;
    let cropHeight = height;
    if (currentAspect > targetAspect) {
      cropWidth = Math.round(height * targetAspect);
    } else if (currentAspect < targetAspect) {
      cropHeight = Math.round(width / targetAspect);
    }

    const originX = Math.max(0, Math.round((width - cropWidth) / 2));
    const originY = Math.max(0, Math.round((height - cropHeight) / 2));
    const targetWidth = Math.max(1, Number(config.normalizeWidth) || cropWidth);
    const targetHeight = Math.max(1, Number(config.normalizeHeight) || cropHeight);
    const scale = Math.min(1, targetWidth / cropWidth, targetHeight / cropHeight);
    const outputWidth = Math.max(1, Math.round(cropWidth * scale));
    const outputHeight = Math.max(1, Math.round(cropHeight * scale));
    const actions = [];

    if (cropWidth !== width || cropHeight !== height) {
      actions.push({
        crop: {
          originX,
          originY,
          width: cropWidth,
          height: cropHeight,
        },
      });
    }
    if (outputWidth !== cropWidth || outputHeight !== cropHeight) {
      actions.push({ resize: { width: outputWidth, height: outputHeight } });
    }

    return { actions, width: outputWidth, height: outputHeight };
  }

  const maxLongEdge = Math.max(1, Number(config.maxLongEdge) || 1600);
  const currentLongEdge = Math.max(width, height);
  if (currentLongEdge <= maxLongEdge) {
    return { actions: [], width, height };
  }

  const scale = maxLongEdge / currentLongEdge;
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  return {
    actions: [{ resize: { width: outputWidth, height: outputHeight } }],
    width: outputWidth,
    height: outputHeight,
  };
};

/**
 * Resize and re-encode every selected image as JPEG on both native and web.
 */
export const normalizeImageUri = async (uri, options = {}, knownSize = null) => {
  if (!uri) return uri;
  const config = { ...DEFAULT_OPTIONS, ...options };

  try {
    const size =
      knownSize?.width && knownSize?.height
        ? knownSize
        : await getImageSize(uri);
    const { actions } = buildImageTransform(size.width, size.height, config);

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: config.normalizeCompress,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const normalizedUri = result?.uri || uri;
    if (normalizedUri !== uri && config.revokeSourceObjectUrl !== false) {
      revokeObjectUrl(uri);
    }
    return normalizedUri;
  } catch (err) {
    if (config.revokeSourceObjectUrl !== false) {
      revokeObjectUrl(uri);
    }
    console.error('normalizeImageUri failed:', err);
    throw err;
  }
};

const mapWithConcurrency = async (items, worker, concurrency = 2) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
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

  const preparePickedUri = useCallback(
    (uri, knownSize = null) =>
      config.processOnSelect === false
        ? Promise.resolve(uri)
        : normalizeImageUri(uri, config, knownSize),
    [config]
  );

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
        const asset = result.assets[0];
        const uri = await preparePickedUri(asset.uri, asset);
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
  }, [config, preparePickedUri, requestGalleryPermission]);

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
      const picked = (result.assets || []).filter((asset) => asset?.uri);
      const uris = await mapWithConcurrency(
        picked,
        (asset) => preparePickedUri(asset.uri, asset),
        2
      );
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
  }, [config, preparePickedUri, requestGalleryPermission]);

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
        const asset = result.assets[0];
        const uri = await preparePickedUri(asset.uri, asset);
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
  }, [config, preparePickedUri, requestCameraPermission]);

  /**
   * Handle web file input
   * @param {Function} onSelect - Callback when file is selected
   */
  const pickFromWeb = useCallback((onSelect) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (file) {
          const localUri = URL.createObjectURL(file);
          const uri = await preparePickedUri(localUri);
          setImageUri(uri);
          setError(null);
          if (onSelect) onSelect(uri);
        }
      } catch (err) {
        console.error('Error processing web image:', err);
        setError(err);
        Alert.alert('Error', 'Failed to process image.');
      }
    };
    input.click();
  }, [config, preparePickedUri]);

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
      input.onchange = async (e) => {
        try {
          const files = Array.from(e.target.files || []).slice(0, selectionLimit);
          const localUris = files.map((file) => URL.createObjectURL(file));
          const uris = await mapWithConcurrency(
            localUris,
            (uri) => preparePickedUri(uri),
            2
          );
          if (uris.length) {
            setImageUri(uris[0]);
            setError(null);
          }
          resolve(uris);
        } catch (err) {
          console.error('Error processing web images:', err);
          setError(err);
          Alert.alert('Error', 'Failed to process images.');
          resolve([]);
        }
      };
      input.click();
    });
  }, [config, preparePickedUri]);

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
    setImageUri((currentUri) => {
      revokeObjectUrl(currentUri);
      return null;
    });
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
