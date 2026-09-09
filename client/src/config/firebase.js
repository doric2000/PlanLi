import { initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getReactNativePersistence,
  initializeAuth,
  connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { Platform } from 'react-native'; // <--- Import Platform
import { initializePlanLiAppCheck } from './appCheck';
import { resolveFirebaseEnvironment } from './firebaseEnvironment';
import { secureAuthStorage } from './secureAuthStorage';
import { localEmulatorSettings } from './localEmulators';

const emulators = localEmulatorSettings();

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

// The Android emulator transport buffers streaming responses; close each local poll.
const db = emulators
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : getFirestore(app);
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

// Connect every SDK before exporting it; a missing emulator must never fall back to live services.
if (emulators) {
  connectAuthEmulator(auth, `http://${emulators.host}:${emulators.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulators.host, emulators.firestore);
  connectStorageEmulator(storage, emulators.host, emulators.storage);
  connectFunctionsEmulator(cloudFunctions, emulators.host, emulators.functions);
}

export { app, appCheck, auth, cloudFunctions, db, mediaBucket, storage };
