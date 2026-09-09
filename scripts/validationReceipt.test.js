const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { signature, reusableReceipt, writeReceipt } = require('./validationReceipt');

test('receipts bind source bytes, command, dependencies and environment, not Git commit IDs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-receipt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'source.js'), 'one');
  const args = { root, scope: 'client', command: 'node', args: ['test'], files: ['source.js'], env: {} };
  const first = signature(args);
  assert.equal(signature(args), first);
  assert.equal(signature({ ...args, env: { GITHUB_SHA: 'different' } }), first);
  assert.notEqual(signature({ ...args, env: { EXPO_PUBLIC_USE_FIREBASE_EMULATORS: 'true' } }), first);
  assert.notEqual(signature({ ...args, args: ['different-test'] }), first);
  assert.notEqual(signature({ ...args, env: { NODE_OPTIONS: '--conditions=test' } }), first);
  fs.writeFileSync(path.join(root, 'source.js'), 'two');
  assert.notEqual(signature(args), first);
  fs.unlinkSync(path.join(root, 'source.js'));
  assert.notEqual(signature(args), first);
});
test('failed, stale, missing-log and corrupt receipts cannot pass validation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-receipt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'receipt.json');
  const logPath = path.join(root, 'test.log');
  fs.writeFileSync(logPath, 'passed');
  writeReceipt(file, { status: 'passed', signature: 'a', logPath });
  assert.ok(reusableReceipt(file, 'a'));
  assert.equal(reusableReceipt(file, 'b'), null);
  writeReceipt(file, { status: 'failed', signature: 'a', logPath });
  assert.equal(reusableReceipt(file, 'a'), null);
  writeReceipt(file, { status: 'passed', signature: 'a', logPath: 'missing' });
  assert.equal(reusableReceipt(file, 'a'), null);
  fs.writeFileSync(file, '{');
  assert.equal(reusableReceipt(file, 'a'), null);
});
