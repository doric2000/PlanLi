const { spawnSync } = require('node:child_process');
const path = require('node:path');

const clientRoot = path.resolve(__dirname, '..');

function fail(message) {
  process.stderr.write(`EAS production environment verification failed: ${message}\n`);
  process.exit(1);
}

try {
  const required = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY',
    'EXPO_PUBLIC_SENTRY_DSN',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'SENTRY_AUTH_TOKEN',
  ];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    fail(`missing readable variables: ${missing.join(', ')}.`);
  }
  if (
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== 'planli-f0b12'
    || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN !== 'planli.cc'
    || process.env.EXPO_PUBLIC_FIREBASE_MEDIA_BUCKET !== 'planli-f0b12-media-eu'
    || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID !== '633543026638'
    || process.env.EXPO_PUBLIC_FIREBASE_APP_ID !== '1:633543026638:web:b63d2a622f3d685646ad9f'
  ) {
    fail('the readable Firebase values do not identify the exact production project.');
  }
  if (process.env.SENTRY_ORG !== 'planli-t2' || process.env.SENTRY_PROJECT !== 'planli-mobile') {
    fail('the Sentry organization or project does not match PlanLi production.');
  }

  const sentryExecutable = process.platform === 'win32' ? 'sentry-cli.cmd' : 'sentry-cli';
  const sentry = spawnSync(sentryExecutable, ['info'], {
    cwd: clientRoot,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (sentry.status !== 0) {
    fail('Sentry rejected the production build token or project configuration.');
  }

  process.stdout.write(
    'Readable EAS production values verified: Firebase, App Check and Sentry are available.\n'
  );
} catch (error) {
  fail(error.message);
}
