import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from 'react-native'; // <--- Import Platform

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDummyKey",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "planli-dummy.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "planli-dummy",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "planli-dummy.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:dummy",
};

const app = initializeApp(firebaseConfig);

// Initialize Auth conditionally
let auth;

if (Platform.OS === 'web') {
  // 1. On Web: Use standard getAuth() (uses browser memory/cookies)
  auth = getAuth(app);
} else {
  // 2. On Mobile: Use AsyncStorage for persistence
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
}

const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };