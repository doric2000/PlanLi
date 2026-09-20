const fs = require('node:fs');

function androidDemoConfig(env = process.env, readFile = fs.readFileSync) {
  if (env.PLANLI_ANDROID_DEMO !== 'true') return null;
  if (env.PLANLI_ENV !== 'development' || env.PLANLI_LOCAL_E2E === 'true'
    || env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true'
    || (env.EAS_BUILD_PROFILE && env.EAS_BUILD_PROFILE !== 'android-demo')
    || (env.EAS_BUILD_PLATFORM && env.EAS_BUILD_PLATFORM !== 'android')) {
    throw new Error('Android demo configuration requires the isolated development profile.');
  }
  const nativePath = env.PLANLI_DEMO_GOOGLE_SERVICES_FILE;
  const firebasePath = env.PLANLI_DEMO_FIREBASE_CONFIG_FILE;
  if (!nativePath || !firebasePath) throw new Error('Android demo Firebase files are required.');
  const native = JSON.parse(readFile(nativePath, 'utf8'));
  const firebase = JSON.parse(readFile(firebasePath, 'utf8'));
  const packageName = 'com.planli.planlitravels.demo';
  const projectId = 'planli-staging-demo';
  const client = native.client?.find((entry) => entry.client_info?.android_client_info?.package_name === packageName);
  const sender = String(native.project_info?.project_number || '');
  if (native.project_info?.project_id !== projectId || firebase.projectId !== projectId
    || firebase.messagingSenderId !== sender || !sender
    || !firebase.appId?.startsWith(`1:${sender}:web:`)
    || !client?.client_info?.mobilesdk_app_id?.startsWith(`1:${sender}:android:`)
    || !/^AIza[\w-]{35}$/.test(firebase.apiKey || '')) {
    throw new Error('Android demo files must reference only the isolated demo project and app.');
  }
  return { nativePath, packageName, firebase: { ...firebase,
    authDomain: `${projectId}.firebaseapp.com`, storageBucket: `${projectId}-media-eu` } };
}

module.exports = { androidDemoConfig };
