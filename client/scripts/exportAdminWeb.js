const { spawnSync } = require('node:child_process');
const path = require('node:path');

const expoCli = require.resolve('expo/bin/cli');
const output = path.resolve(__dirname, '..', '..', 'hosting', 'admin');
const CI_PR_RECAPTCHA_SITE_KEY = 'planli-ci-pr-app-check-validation';

function resolveRecaptchaSiteKey(env = process.env) {
  const configured = String(env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY || '').trim();
  if (configured) return configured;
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'pull_request') {
    return CI_PR_RECAPTCHA_SITE_KEY;
  }
  throw new Error('Admin Web export requires EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY.');
}

function exportAdminWeb(env = process.env) {
  const recaptchaSiteKey = resolveRecaptchaSiteKey(env);
  const result = spawnSync(process.execPath, [
    expoCli, 'export', '--platform', 'web', '--output-dir', output, '--clear',
  ], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...env,
      PLANLI_ADMIN_WEB: 'true',
      EXPO_PUBLIC_ADMIN_WEB: 'true',
      EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: recaptchaSiteKey,
    },
    stdio: 'inherit',
  });
  if (result.status === 0) {
    const { verifyAdminExport } = require('./verifyAdminExport');
    verifyAdminExport(output, { expectedRecaptchaSiteKey: recaptchaSiteKey });
  }
  return result.status ?? 1;
}

if (require.main === module) process.exitCode = exportAdminWeb();

module.exports = {
  CI_PR_RECAPTCHA_SITE_KEY,
  exportAdminWeb,
  resolveRecaptchaSiteKey,
};
