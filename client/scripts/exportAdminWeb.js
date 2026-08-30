const { spawnSync } = require('node:child_process');
const path = require('node:path');

const expoCli = require.resolve('expo/bin/cli');
const output = path.resolve(__dirname, '..', '..', 'hosting', 'admin');
const recaptchaSiteKey = String(process.env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY || '').trim();
if (!recaptchaSiteKey) {
  throw new Error('Admin Web export requires EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY.');
}
const result = spawnSync(process.execPath, [
  expoCli, 'export', '--platform', 'web', '--output-dir', output, '--clear',
], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PLANLI_ADMIN_WEB: 'true', EXPO_PUBLIC_ADMIN_WEB: 'true' },
  stdio: 'inherit',
});
if (result.status === 0) {
  const { verifyAdminExport } = require('./verifyAdminExport');
  verifyAdminExport(output, { expectedRecaptchaSiteKey: recaptchaSiteKey });
}
process.exitCode = result.status ?? 1;
