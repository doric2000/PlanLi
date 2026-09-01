import { initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { Platform } from 'react-native'; // <--- Import Platform
import { initializePlanLiAppCheck } from './appCheck';
import { resolveFirebaseEnvironment } from './firebaseEnvironment';
import { secureAuthStorage } from './secureAuthStorage';

const firebaseConfig = resolveFirebaseEnvironment({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET ||
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}, Platform.OS);

const app = initializeApp(firebaseConfig);
const appCheck = initializePlanLiAppCheck(app, firebaseConfig);

// Initialize Auth conditionally
let auth;

if (Platform.OS === 'web') {
  auth = initializeAuth(app, { persistence: browserSessionPersistence });
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(secureAuthStorage)
  });
}

const db = getFirestore(app);
const mediaBucket =
  process.env.EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET ||
  (firebaseConfig.projectId === "planli-f0b12"
    ? "planli-f0b12-media-eu"
    : firebaseConfig.storageBucket);
const storage = getStorage(
  app,
  mediaBucket.startsWith("gs://") ? mediaBucket : `gs://${mediaBucket}`
);
const cloudFunctions = getFunctions(app, "europe-west1");

export { app, appCheck, auth, cloudFunctions, db, mediaBucket, storage };
