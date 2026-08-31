const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const configureApp = require('../app.config');
const { assertProtectedFirebaseEnvironment } = configureApp;
const fixture = (name) => path.join(__dirname, 'fixtures', name);

function stagingEnvironment(overrides = {}) {
  return {
    EAS_BUILD: '1',
    EAS_BUILD_PROFILE: 'staging',
    PLANLI_ENV: 'staging',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'public-staging-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'planli-staging-f0b12.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'planli-staging-f0b12',
    EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET: 'planli-staging-f0b12-media-eu',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:123456789:web:abcdef1234',
    EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: 'staging-enterprise-site-key',
    PLANLI_GOOGLE_SERVICES_IOS_FILE: fixture('GoogleService-Info.staging.plist'),
    PLANLI_GOOGLE_SERVICES_ANDROID_FILE: fixture('google-services.staging.json'),
    ...overrides,
  };
}

function productionEnvironment(overrides = {}) {
  return {
    EAS_BUILD: '1',
    EAS_BUILD_PROFILE: 'production',
    PLANLI_ENV: 'production',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'public-production-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'planli-f0b12.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'planli-f0b12',
    EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET: 'planli-f0b12-media-eu',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '633543026638',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:633543026638:web:b63d2a622f3d685646ad9f',
    EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: 'production-enterprise-site-key',
    PLANLI_GOOGLE_SERVICES_IOS_FILE: fixture('GoogleService-Info.production.plist'),
    PLANLI_GOOGLE_SERVICES_ANDROID_FILE: fixture('google-services.production.json'),
    ...overrides,
  };
}

function withEnvironment(values, action) {
  const names = new Set([
    ...Object.keys(values),
    'GOOGLE_MAPS_IOS_KEY',
    'GOOGLE_MAPS_ANDROID_KEY',
    'EXPO_PUBLIC_SENTRY_DSN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'SENTRY_AUTH_TOKEN',
  ]);
  const previous = Object.fromEntries([...names].map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, values);
    return action();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('protected EAS builds reject missing Firebase configuration', () => {
  assert.throws(() => assertProtectedFirebaseEnvironment({
    EAS_BUILD: '1', EAS_BUILD_PROFILE: 'staging', PLANLI_ENV: 'staging',
  }), /Protected builds require Firebase configuration/);
});

test('protected builds reject a missing reCAPTCHA Enterprise App Check key', () => {
  assert.throws(() => assertProtectedFirebaseEnvironment(productionEnvironment({
    EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: '',
  })), /RECAPTCHA_ENTERPRISE_SITE_KEY/);
});

test('staging cannot consume the production Firebase project or bucket', () => {
  assert.throws(() => assertProtectedFirebaseEnvironment(stagingEnvironment({
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'planli-f0b12',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'planli-f0b12.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET: 'planli-f0b12-media-eu',
  })), /distinct planli-staging/);
  assert.throws(() => assertProtectedFirebaseEnvironment(stagingEnvironment({
    EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET: 'planli-f0b12-media-eu',
  })), /staging project/);
});

test('staging cannot consume production native Firebase files', () => {
  assert.throws(() => assertProtectedFirebaseEnvironment(stagingEnvironment({
    PLANLI_GOOGLE_SERVICES_IOS_FILE: fixture('GoogleService-Info.production.plist'),
    PLANLI_GOOGLE_SERVICES_ANDROID_FILE: fixture('google-services.production.json'),
  })), /Native Google Services files|production apps/);
});

test('production rejects missing, malformed and staging native Firebase files', () => {
  assert.throws(() => assertProtectedFirebaseEnvironment(productionEnvironment({
    PLANLI_GOOGLE_SERVICES_ANDROID_FILE: './missing-google-services.json',
  })), /readable/);
  assert.throws(() => assertProtectedFirebaseEnvironment(productionEnvironment({
    PLANLI_GOOGLE_SERVICES_IOS_FILE: fixture('GoogleService-Info.staging.plist'),
    PLANLI_GOOGLE_SERVICES_ANDROID_FILE: fixture('google-services.staging.json'),
  })), /Native Google Services files|exact production apps/);
});

test('protected builds reject cross-project Firebase app IDs', () => {
  assert.throws(() => assertProtectedFirebaseEnvironment(stagingEnvironment({
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:987654321:web:abcdef1234',
  })), /different projects/);
});

test('staging and exact production Firebase configurations pass', () => {
  assert.doesNotThrow(() => assertProtectedFirebaseEnvironment(stagingEnvironment()));
  assert.doesNotThrow(() => assertProtectedFirebaseEnvironment(productionEnvironment()));
});

test('profile and PLANLI_ENV must match', () => {
  assert.throws(() => assertProtectedFirebaseEnvironment(stagingEnvironment({
    EAS_BUILD_PROFILE: 'production',
  })), /cannot use PLANLI_ENV/);
});

test('release-candidate builds require production crash reporting', () => {
  withEnvironment(productionEnvironment({
    EAS_BUILD_PROFILE: 'release-candidate',
    PLANLI_ENV: 'release-candidate',
    GOOGLE_MAPS_IOS_KEY: 'ios-public-key',
    GOOGLE_MAPS_ANDROID_KEY: 'android-public-key',
  }), () => {
    assert.throws(() => configureApp({ config: {} }), /crash-reporting configuration/);
  });
});

test('native Maps keys use the SDK 57 react-native-maps config plugin only', () => {
  withEnvironment(productionEnvironment({
    GOOGLE_MAPS_IOS_KEY: 'ios-public-key',
    GOOGLE_MAPS_ANDROID_KEY: 'android-public-key',
    EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
    SENTRY_ORG: 'planli',
    SENTRY_PROJECT: 'mobile',
    SENTRY_AUTH_TOKEN: 'build-token',
  }), () => {
    const resolved = configureApp({
      config: {
        plugins: ['expo-font', 'react-native-maps'],
        ios: {},
        android: {},
      },
    });
    const mapsPlugins = resolved.plugins.filter((plugin) => (
      (Array.isArray(plugin) ? plugin[0] : plugin) === 'react-native-maps'
    ));

    assert.deepEqual(mapsPlugins, [[
      'react-native-maps',
      {
        iosGoogleMapsApiKey: 'ios-public-key',
        androidGoogleMapsApiKey: 'android-public-key',
      },
    ]]);
    assert.equal(resolved.ios.config?.googleMapsApiKey, undefined);
    assert.equal(resolved.android.config?.googleMaps, undefined);
  });
});
