const test = require('node:test');
const assert = require('node:assert/strict');
const { releasePlan: plan } = require('./releaseReadiness');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-release-test-'));
fs.mkdirSync(path.join(root, 'client/src/styles'), { recursive: true });
fs.writeFileSync(path.join(root, 'client/src/styles/appStyles.js'), 'module.exports = {};');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const releasePlan = (files, options) => plan(files, { ...options, root });

test('OTA checks changed client behavior without backend, native checks, exports or audits', () => {
  const r = releasePlan(['client/src/styles/appStyles.js']);
  assert.equal(r.backend, false);
  assert.equal(r.checkNative, false);
  assert.equal(r.plan.nativeExport, false);
  assert.equal(r.plan.adminExport, false);
  assert.equal(r.plan.clientFull, false);
});
test('affected backend and rules remain checked for OTA and build releases', () => {
  const backend = releasePlan(['functions/recommendationService.js']);
  assert.equal(backend.backend, true);
  assert.equal(backend.plan.rules, false);
  const rules = releasePlan(['firestore.rules'], { kind: 'build' });
  assert.equal(rules.backend, true);
  assert.equal(rules.plan.rules, true);
});
test('native inputs require a build compatibility check', () => {
  assert.throws(() => releasePlan(['client/package-lock.json']), /Native inputs/);
  assert.throws(() => releasePlan(['client/app.config.js']), /Native inputs/);
});
test('native builds expand client coverage for dependency changes without unrelated backend', () => {
  const r = releasePlan(['client/package-lock.json'], { kind: 'build', platform: 'android' });
  assert.equal(r.plan.clientFull, true);
  assert.equal(r.checkNative, true);
  assert.equal(r.backend, false);
});
test('full suites remain explicit', () => {
  const r = releasePlan([], { kind: 'full' });
  assert.equal(r.plan.clientFull, true);
  assert.equal(r.backend, true);
  assert.throws(() => releasePlan([], { kind: 'unknown' }), /kind/);
});
