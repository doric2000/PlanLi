const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PROJECT_ID = 'planli-f0b12';

function firebaseToolsLibDirectory() {
  const candidates = [];
  if (process.env.APPDATA) {
    candidates.push(path.join(
      process.env.APPDATA,
      'npm',
      'node_modules',
      'firebase-tools',
      'lib'
    ));
  }
  try {
    const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const globalRoot = execFileSync(npmExecutable, ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    candidates.push(path.join(globalRoot, 'firebase-tools', 'lib'));
  } catch {
    // The explicit candidates below produce the useful error message.
  }

  for (const directory of candidates) {
    try {
      require.resolve(path.join(directory, 'auth.js'));
      return directory;
    } catch {
      // Continue to the next supported global npm location.
    }
  }
  throw new Error('Firebase CLI was not found. Install it and run `firebase login`.');
}

function firebaseCliAuthorizedUser() {
  const directory = firebaseToolsLibDirectory();
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const auth = require(path.join(directory, 'auth.js'));
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const api = require(path.join(directory, 'api.js'));
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('Run `firebase login` before running Admin maintenance scripts.');
  }
  return {
    type: 'authorized_user',
    client_id: api.clientId(),
    client_secret: api.clientSecret(),
    refresh_token: account.tokens.refresh_token,
  };
}

let temporaryAdcDirectory = null;

function cleanupTemporaryAdc() {
  if (!temporaryAdcDirectory) return;
  try {
    fs.rmSync(temporaryAdcDirectory, { recursive: true, force: true });
  } finally {
    temporaryAdcDirectory = null;
  }
}

function ensureApplicationDefaultCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  temporaryAdcDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-adc-'));
  const credentialPath = path.join(temporaryAdcDirectory, 'application_default_credentials.json');
  fs.writeFileSync(
    credentialPath,
    `${JSON.stringify({
      ...firebaseCliAuthorizedUser(),
      quota_project_id: DEFAULT_PROJECT_ID,
    })}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath;
  process.once('exit', cleanupTemporaryAdc);
  return credentialPath;
}

function initializeAdmin(admin, options = {}) {
  if (admin.apps.length) return admin.app();
  const configuration = {
    projectId: options.projectId || DEFAULT_PROJECT_ID,
    ...(options.storageBucket ? { storageBucket: options.storageBucket } : {}),
  };
  ensureApplicationDefaultCredentials();
  configuration.credential = admin.credential.applicationDefault();
  return admin.initializeApp(configuration);
}

function googleAuthOptions(options = {}) {
  const configuration = { projectId: options.projectId || DEFAULT_PROJECT_ID };
  configuration.keyFilename = ensureApplicationDefaultCredentials();
  return configuration;
}

module.exports = {
  firebaseCliAuthorizedUser,
  firebaseToolsLibDirectory,
  googleAuthOptions,
  initializeAdmin,
  ensureApplicationDefaultCredentials,
};
