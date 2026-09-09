'use strict';
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const PROJECT = 'demo-planli-e2e';
const BUCKET = `${PROJECT}.appspot.com`;
const DIRECTORY = path.join(ROOT, '.codex_tmp/android');

function assertLocalEnvironment(env = process.env, { emulatorService = false } = {}) {
  if (env.PLANLI_LOCAL_E2E !== 'true' || env.GCLOUD_PROJECT !== PROJECT || env.EAS_BUILD
    || (env.K_SERVICE && !(emulatorService && env.FUNCTIONS_EMULATOR === 'true'))
    || env.NODE_ENV === 'production') throw new Error('E2E tools are restricted to the local demo project: ' + JSON.stringify({ local: env.PLANLI_LOCAL_E2E, project: env.GCLOUD_PROJECT, build: Boolean(env.EAS_BUILD), service: env.K_SERVICE, emulator: env.FUNCTIONS_EMULATOR, mode: env.NODE_ENV }));
  for (const [key, port] of Object.entries({ FIREBASE_AUTH_EMULATOR_HOST: 9099, FIRESTORE_EMULATOR_HOST: 8080,
    FIREBASE_STORAGE_EMULATOR_HOST: 9199 })) {
    if (env[key] !== `127.0.0.1:${port}`) throw new Error(`${key} must point to the local emulator.`);
  }
  return true;
}

function localEnvironment() {
  if (process.env.EAS_BUILD || process.env.K_SERVICE || process.env.NODE_ENV === 'production') {
    throw new Error('Do not run the local harness from a release or deployed runtime.');
  }
  const env = { ...process.env, PLANLI_LOCAL_E2E: 'true', PLANLI_ENV: 'development', NODE_ENV: 'development',
    GCLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_PROJECT: PROJECT, EXPO_NO_DOTENV: '1',
    FUNCTIONS_EMULATOR: 'true', FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT, storageBucket: BUCKET }),
    XDG_CONFIG_HOME: path.join(DIRECTORY, 'config'), FIREBASE_EMULATORS_PATH: path.join(DIRECTORY, 'firebase-cache'),
    APPDATA: path.join(DIRECTORY, 'appdata'), CLOUDSDK_CONFIG: path.join(DIRECTORY, 'gcloud'),
    FIREBASE_CLI_DISABLE_TELEMETRY: 'true', METADATA_SERVER_DETECTION: 'none',
    FUNCTIONS_DISCOVERY_TIMEOUT: '120',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199', STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
    EXPO_PUBLIC_USE_FIREBASE_EMULATORS: 'true', EXPO_PUBLIC_REGION_DISCOVERY_ENABLED: 'true', EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '10.0.2.2',
    EXPO_PUBLIC_FIREBASE_API_KEY: `AIza${'E'.repeat(35)}`, EXPO_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`, EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET: BUCKET,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: BUCKET, EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:123456789012:web:abcdef123456', EXPO_PUBLIC_SENTRY_DSN: '',
    SENTRY_DISABLE_AUTO_UPLOAD: 'true', SENTRY_DISABLE_NATIVE: 'true',
    ANDROID_HOME: path.join(DIRECTORY, 'sdk'), ANDROID_SDK_ROOT: path.join(DIRECTORY, 'sdk'),
    ANDROID_USER_HOME: path.join(DIRECTORY, 'user'), ANDROID_AVD_HOME: path.join(DIRECTORY, 'avd'),
    JAVA_HOME: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.9.10-hotspot',
  };
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'EAS_BUILD', 'K_SERVICE', 'SENTRY_AUTH_TOKEN', 'EXPO_TOKEN']) delete env[key];
  env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${path.join(env.ANDROID_HOME, 'platform-tools')}${path.delimiter}${env.PATH || env.Path || ''}`;
  delete env.Path;
  return env;
}

module.exports = { ROOT, PROJECT, BUCKET, DIRECTORY, assertLocalEnvironment, localEnvironment };
