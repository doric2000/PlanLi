const { spawnSync } = require('node:child_process');
const path = require('node:path');

const expoCli = require.resolve('expo/bin/cli');
const output = path.resolve(__dirname, '..', '..', 'hosting', 'admin');
const result = spawnSync(process.execPath, [
  expoCli, 'export', '--platform', 'web', '--output-dir', output,
], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PLANLI_ADMIN_WEB: 'true', EXPO_PUBLIC_ADMIN_WEB: 'true' },
  stdio: 'inherit',
});
if (result.status === 0) {
  const { verifyAdminExport } = require('./verifyAdminExport');
  verifyAdminExport(output);
}
process.exitCode = result.status ?? 1;
