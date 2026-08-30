const { spawnSync } = require('node:child_process');

const DEFAULT_PROJECT_ID = 'planli-f0b12';
const DEFAULT_MEDIA_BUCKET = 'planli-f0b12-media-eu';

function gcloudAccessToken({ runner = spawnSync } = {}) {
  const command = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const result = runner(command, ['auth', 'print-access-token', '--quiet'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error(`gcloud access-token fallback could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error('gcloud access-token fallback failed; sign in with gcloud auth login.');
  const accessToken = String(result.stdout || '').trim();
  if (accessToken.length < 40 || accessToken.length > 4096 || /\s/.test(accessToken)) {
    throw new Error('gcloud returned an invalid access token.');
  }
  return { access_token: accessToken, expires_in: 3000 };
}

function initializeAdmin(admin, options = {}) {
  if (admin.apps.length) return admin.app();
  const projectId = options.projectId || DEFAULT_PROJECT_ID;
  const storageBucket = options.storageBucket || DEFAULT_MEDIA_BUCKET;
  return admin.initializeApp({
    projectId,
    storageBucket,
    credential: options.credential || admin.credential.applicationDefault(),
  });
}

function googleAuthOptions(options = {}) {
  return {
    projectId: options.projectId || DEFAULT_PROJECT_ID,
  };
}

module.exports = {
  DEFAULT_MEDIA_BUCKET,
  DEFAULT_PROJECT_ID,
  gcloudAccessToken,
  googleAuthOptions,
  initializeAdmin,
};
