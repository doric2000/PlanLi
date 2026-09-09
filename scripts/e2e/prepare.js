'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, PROJECT, BUCKET, DIRECTORY, assertLocalEnvironment } = require('./environment');

function prepare() {
  assertLocalEnvironment();
  const source = path.join(DIRECTORY, 'functions');
  fs.mkdirSync(source, { recursive: true });
  const dependencies = JSON.parse(fs.readFileSync(path.join(ROOT, 'functions/package.json'))).dependencies;
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'planli-local-emulator', private: true,
    main: 'index.js', engines: { node: '22' },
    dependencies: { 'firebase-admin': dependencies['firebase-admin'], 'firebase-functions': dependencies['firebase-functions'] } }));
  // Firebase CLI discovery intentionally omits user-defined environment variables.
  // This ignored entrypoint grants the local flag only inside the emulator process;
  // the bootstrap separately verifies the demo project, all service hosts and mode.
  fs.writeFileSync(path.join(source, 'index.js'),
    "if (process.env.FUNCTIONS_EMULATOR !== 'true') throw new Error('Local emulator only');\n" +
    "process.env.PLANLI_LOCAL_E2E = 'true';\nmodule.exports = require(" +
    JSON.stringify(path.join(ROOT, 'scripts/e2e/functionsBootstrap.js')) + ");\n");
  const modules = path.join(source, 'node_modules');
  if (!fs.existsSync(modules)) fs.symlinkSync(path.join(ROOT, 'functions/node_modules'), modules, 'junction');
  fs.writeFileSync(path.join(source, '.secret.local'), [
    'PUBLIC_RATE_LIMIT_KEY=local-e2e-only-'.padEnd(75, 'x'), 'REST_COUNTRIES_KEY=local-fixture',
    'OPENWEATHER_API_KEY=local-fixture', 'UNSPLASH_ACCESS_KEY=local-fixture',
    'APPLE_SIGN_IN_PRIVATE_KEY=local-fixture', 'EXPO_PUSH_ACCESS_TOKEN=local-fixture',
  ].join('\n'));
  fs.writeFileSync(path.join(source, '.env.local'), [
    `MEDIA_STORAGE_BUCKET=${BUCKET}`, 'APPLE_SIGN_IN_TEAM_ID=LOCAL', 'APPLE_SIGN_IN_KEY_ID=LOCAL',
    'PLANLI_ENFORCE_APP_CHECK=true', 'PLANLI_LOCAL_E2E=true',
    'APPLE_SIGN_IN_CLIENT_ID=com.planli.planlitravels.e2e',
  ].join('\n'));
  for (const file of ['firestore.rules', 'firestore.indexes.json', 'storage.rules']) {
    fs.copyFileSync(path.join(ROOT, file), path.join(DIRECTORY, file));
  }
  const config = {
    functions: [{ source: 'functions', codebase: 'local-e2e', runtime: 'nodejs22' }],
    firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
    storage: { rules: 'storage.rules' },
    emulators: { singleProjectMode: true, ui: { enabled: false },
      auth: { host: '127.0.0.1', port: 9099 }, firestore: { host: '127.0.0.1', port: 8080 },
      storage: { host: '127.0.0.1', port: 9199 }, functions: { host: '127.0.0.1', port: 5001 },
      hub: { host: '127.0.0.1', port: 4400 }, logging: { host: '127.0.0.1', port: 4500 },
    },
  };
  fs.writeFileSync(path.join(DIRECTORY, 'firebase.e2e.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(DIRECTORY, 'google-services.json'), JSON.stringify({
    project_info: { project_number: '123456789012', project_id: PROJECT, storage_bucket: BUCKET },
    client: [{ client_info: { mobilesdk_app_id: '1:123456789012:android:abcdef123456',
      android_client_info: { package_name: 'com.planli.planlitravels.e2e' } },
      api_key: [{ current_key: `AIza${'E'.repeat(35)}` }], oauth_client: [], services: { appinvite_service: { other_platform_oauth_client: [] } } }],
    configuration_version: '1',
  }));
  console.log('Prepared demo-only emulator configuration and synthetic native app configuration.');
}
if (require.main === module) prepare();
module.exports = { prepare };
