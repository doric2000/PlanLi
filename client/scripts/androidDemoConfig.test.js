const test = require('node:test');
const assert = require('node:assert/strict');
const { androidDemoConfig } = require('./androidDemoConfig');
const env = { PLANLI_ANDROID_DEMO: 'true', PLANLI_ENV: 'development', EAS_BUILD_PROFILE: 'android-demo',
  EAS_BUILD_PLATFORM: 'android', PLANLI_DEMO_GOOGLE_SERVICES_FILE: 'native', PLANLI_DEMO_FIREBASE_CONFIG_FILE: 'web' };
const files = { native: { project_info: { project_id: 'planli-staging-demo', project_number: '123' },
  client: [{ client_info: { android_client_info: { package_name: 'com.planli.planlitravels.demo' }, mobilesdk_app_id: '1:123:android:abc' } }] },
web: { projectId: 'planli-staging-demo', messagingSenderId: '123', appId: '1:123:web:abc', apiKey: `AIza${'x'.repeat(35)}` } };
const read = (name) => JSON.stringify(files[name]);
test('ordinary builds do not consume demo files', () => assert.equal(androidDemoConfig({}, () => { throw new Error('read'); }), null));
test('demo uses its own bucket and package', () => {
  const result = androidDemoConfig(env, read);
  assert.equal(result.firebase.storageBucket, 'planli-staging-demo-media-eu');
  assert.equal(result.packageName, 'com.planli.planlitravels.demo');
});
test('production, iOS and emulator profiles reject demo configuration', () => {
  for (const change of [{ PLANLI_ENV: 'production' }, { EAS_BUILD_PROFILE: 'production' },
    { EAS_BUILD_PLATFORM: 'ios' }, { EXPO_PUBLIC_USE_FIREBASE_EMULATORS: 'true' }]) {
    assert.throws(() => androidDemoConfig({ ...env, ...change }, read));
  }
});
test('production Firebase and mismatched native registration cannot enter demo', () => {
  for (const key of ['native','web']) {
    assert.throws(() => androidDemoConfig(env, (name) => {
      const value = structuredClone(files[name]);
      if (name === key) { if (key === 'native') value.project_info.project_id = 'planli-f0b12'; else value.projectId = 'planli-f0b12'; }
      return JSON.stringify(value);
    }));
  }
});
