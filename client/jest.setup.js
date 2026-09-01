jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||= 'AIzaSy123456789012345678901234567890123';
process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||= 'planli-test.firebaseapp.com';
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||= 'planli-test';
process.env.EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET ||= 'planli-test-media';
process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||= 'planli-test-media';
process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||= '987654321';
process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||= '1:987654321:web:abcdef1234';
