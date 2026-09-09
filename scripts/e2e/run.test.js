const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, cleanup } = require('./run');
const { ROOT } = require('./environment');

test('a hung device command fails within its deadline and its process is stopped', { timeout: 10000 }, async (t) => {
  t.after(cleanup);
  await assert.rejects(run('maestro-timeout-control', process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'], ROOT, { timeoutMs: 100 }), /timed out after 100ms/);
  const pid = Number(fs.readFileSync(path.join(ROOT, '.codex_tmp/validation/android/maestro-timeout-control.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
