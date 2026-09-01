const fs = require('node:fs');
const path = require('node:path');

const PRODUCTION_PROJECT_ID = 'planli-f0b12';
const PRODUCTION_FIREBASE_APP_ID = '1:633543026638:web:b63d2a622f3d685646ad9f';
const PRODUCTION_FIREBASE_IOS_APP_ID = '1:633543026638:ios:b13b28c424e4c9e846ad9f';
const PRODUCTION_FIREBASE_ANDROID_APP_ID = '1:633543026638:android:4f0dc56759f6923b46ad9f';
const PRODUCTION_MESSAGING_SENDER_ID = '633543026638';
const PROTECTED_ENVIRONMENTS = new Set(['staging', 'release-candidate', 'production']);
const REQUIRED_FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY',
  'PLANLI_GOOGLE_SERVICES_IOS_FILE',
  'PLANLI_GOOGLE_SERVICES_ANDROID_FILE',
];

function plistValue(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`<key>\\s*${escaped}\\s*</key>\\s*<string>([^<]+)</string>`, 'u'))?.[1]?.trim() || '';
}

function assertProtectedNativeFirebaseFiles(env = process.env, { readFile = fs.readFileSync } = {}) {
  if (!env.EAS_BUILD || !PROTECTED_ENVIRONMENTS.has(String(env.PLANLI_ENV || '').trim())) return null;
  const iosPath = path.resolve(String(env.PLANLI_GOOGLE_SERVICES_IOS_FILE || '').trim());
  const androidPath = path.resolve(String(env.PLANLI_GOOGLE_SERVICES_ANDROID_FILE || '').trim());
  let plist;
  let android;
  try {
    plist = readFile(iosPath, 'utf8');
    android = JSON.parse(readFile(androidPath, 'utf8'));
  } catch {
    throw new Error('Protected builds require readable iOS and Android Google Services files.');
  }
  const projectId = String(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '').trim();
  const senderId = String(env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const iosAppId = plistValue(plist, 'GOOGLE_APP_ID');
  const iosMatches = plistValue(plist, 'PROJECT_ID') === projectId &&
    plistValue(plist, 'GCM_SENDER_ID') === senderId &&
    plistValue(plist, 'BUNDLE_ID') === 'com.planli.planlitravels' &&
    new RegExp(`^1:${senderId}:ios:[a-z0-9]+$`, 'iu').test(iosAppId);
  const androidClient = (Array.isArray(android?.client) ? android.client : []).find((client) =>
    client?.client_info?.android_client_info?.package_name === 'com.planli.planlitravels'
  );
  const androidAppId = String(androidClient?.client_info?.mobilesdk_app_id || '').trim();
  const androidMatches = String(android?.project_info?.project_id || '').trim() === projectId &&
    String(android?.project_info?.project_number || '').trim() === senderId &&
    new RegExp(`^1:${senderId}:android:[a-z0-9]+$`, 'iu').test(androidAppId);
  if (!iosMatches || !androidMatches) {
    throw new Error('Native Google Services files do not match the protected Firebase environment.');
  }
  const planliEnvironment = String(env.PLANLI_ENV || '').trim();
  if (planliEnvironment === 'staging' && (
    iosAppId === PRODUCTION_FIREBASE_IOS_APP_ID ||
    androidAppId === PRODUCTION_FIREBASE_ANDROID_APP_ID
  )) {
    throw new Error('Staging native Firebase files cannot reference production apps.');
  }
  if (['release-candidate', 'production'].includes(planliEnvironment) && (
    iosAppId !== PRODUCTION_FIREBASE_IOS_APP_ID ||
    androidAppId !== PRODUCTION_FIREBASE_ANDROID_APP_ID
  )) {
    throw new Error('Production native Firebase files must reference the exact production apps.');
  }
  return { iosPath, androidPath };
}

function assertProtectedFirebaseEnvironment(env = process.env) {
  if (!env.EAS_BUILD) return;
  const planliEnvironment = String(env.PLANLI_ENV || '').trim();
  if (!PROTECTED_ENVIRONMENTS.has(planliEnvironment)) return;

  const profile = String(env.EAS_BUILD_PROFILE || '').trim();
  const expectedEnvironmentByProfile = {
    preview: 'staging',
    staging: 'staging',
    'release-candidate': 'release-candidate',
    production: 'production',
  };
  if (expectedEnvironmentByProfile[profile] !== planliEnvironment) {
    throw new Error(
      `EAS profile ${profile || '(missing)'} cannot use PLANLI_ENV=${planliEnvironment}.`
    );
  }

  const missing = REQUIRED_FIREBASE_ENV.filter((name) => !String(env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Protected builds require Firebase configuration: ${missing.join(', ')}.`);
  }

  const projectId = String(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID).trim();
  const authDomain = String(env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN).trim();
  const mediaBucket = String(env.EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET).trim();
  const messagingSenderId = String(env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID).trim();
  const appId = String(env.EXPO_PUBLIC_FIREBASE_APP_ID).trim();
  const appSenderId = appId.match(/^1:(\d+):web:[a-z0-9]+$/i)?.[1] || '';

  if (appSenderId !== messagingSenderId) {
    throw new Error('Firebase App ID and messaging sender ID belong to different projects.');
  }

  if (planliEnvironment === 'staging') {
    if (projectId === PRODUCTION_PROJECT_ID || !/^planli-staging-[a-z0-9-]+$/.test(projectId)) {
      throw new Error('Staging builds require a distinct planli-staging-* Firebase project.');
    }
    if (authDomain !== `${projectId}.firebaseapp.com`) {
      throw new Error('Staging Firebase Auth domain must match the staging project.');
    }
    if (mediaBucket === 'planli-f0b12-media-eu' || !mediaBucket.startsWith(`${projectId}`)) {
      throw new Error('Staging media bucket must belong to the staging project.');
    }
    assertProtectedNativeFirebaseFiles(env);
    return;
  }

  if (
    projectId !== PRODUCTION_PROJECT_ID
    || authDomain !== 'planli.cc'
    || mediaBucket !== 'planli-f0b12-media-eu'
    || messagingSenderId !== PRODUCTION_MESSAGING_SENDER_ID
    || appId !== PRODUCTION_FIREBASE_APP_ID
  ) {
    throw new Error('Release-candidate and production builds require the exact production Firebase app.');
  }

  assertProtectedNativeFirebaseFiles(env);
}

function configureApp({ config }) {
  assertProtectedFirebaseEnvironment(process.env);
  const iosKey = String(process.env.GOOGLE_MAPS_IOS_KEY || '').trim();
  const androidKey = String(process.env.GOOGLE_MAPS_ANDROID_KEY || '').trim();
  const releaseBuild = ['release-candidate', 'production'].includes(
    process.env.EAS_BUILD_PROFILE
  );
  const protectedNativeFiles = process.env.EAS_BUILD
    ? assertProtectedNativeFirebaseFiles(process.env)
    : null;
  if (process.env.EAS_BUILD && (!iosKey || !androidKey)) {
    throw new Error('GOOGLE_MAPS_IOS_KEY and GOOGLE_MAPS_ANDROID_KEY are required for native builds.');
  }
  if (process.env.EAS_BUILD && releaseBuild) {
    const requiredSentryValues = [
      'EXPO_PUBLIC_SENTRY_DSN',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
      'SENTRY_AUTH_TOKEN',
    ];
    const missingSentryValues = requiredSentryValues.filter(
      (name) => !String(process.env[name] || '').trim()
    );
    if (missingSentryValues.length) {
      throw new Error(
        `Production builds require Sentry crash-reporting configuration: ${missingSentryValues.join(', ')}.`
      );
    }
  }

  const plugins = (config.plugins || []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'react-native-maps';
  });

  return {
    ...config,
    plugins: [
      ...plugins,
      [
        'react-native-maps',
        {
          ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
          ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
        },
      ],
    ],
    experiments: {
      ...(config.experiments || {}),
      ...(process.env.PLANLI_ADMIN_WEB === 'true' ? { baseUrl: '/admin' } : {}),
    },
    ios: {
      ...config.ios,
      ...(protectedNativeFiles ? { googleServicesFile: protectedNativeFiles.iosPath } : {}),
    },
    android: {
      ...config.android,
      ...(protectedNativeFiles ? { googleServicesFile: protectedNativeFiles.androidPath } : {}),
    },
  };
}

module.exports = configureApp;
module.exports.assertProtectedFirebaseEnvironment = assertProtectedFirebaseEnvironment;
module.exports.assertProtectedNativeFirebaseFiles = assertProtectedNativeFirebaseFiles;
