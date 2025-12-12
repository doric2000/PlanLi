/**
 * Hooks Index - Centralized exports for all custom hooks
 * 
 * This follows the Facade pattern, providing a clean public API
 * for all hooks in the application.
 */

// Image handling hooks (SOLID-based)
export { useImagePicker } from './useImagePicker';
export { useImageUploader, FirebaseUploadStrategy } from './useImageUploader';
export { useImagePickerWithUpload } from './useImagePickerWithUpload';

// Other hooks
export { default as useBackButton } from './useBackButton';
export { default as useCommentsCount } from './useCommentsCount';
export { default as useCurrentUser } from './useCurrentUser';
export { default as useLikes } from './useLikes';
export { default as useRefresh } from './useRefresh';
export { default as useUserData } from './useUserData';
