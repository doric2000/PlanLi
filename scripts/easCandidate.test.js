const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseArgs, runCandidate } = require('./easCandidate');
const { fixture } = require('./testFixtures/easRelease');

test('candidate command is read-only by default and rejects a skip-native argument', () => {
  assert.deepEqual(parseArgs([]), { apply: false, message: '' });
  assert.throws(() => parseArgs(['--skip-native']), /Unknown candidate argument/);
});
test('dry run computes compatibility without publishing or exporting', async t => {
  const f = fixture(t);
  const result = await runCandidate({ repoRoot: f.root, args: parseArgs([]) }, f.dependencies);
  t.after(() => fs.rmSync(result.proofPath, { force: true }));
  assert.equal(result.apply, false);
  assert.ok(f.calls.some(c => c[0] === 'native-local'));
  assert.ok(!f.calls.some(c => ['update', 'update:republish', 'export'].includes(c[0])));
});
test('native mismatch stops before upload even when publication is requested', async t => {
  const f = fixture(t);
  f.dependencies.verifyLocalNative = () => { throw new Error('Native mismatch'); };
  await assert.rejects(runCandidate({ repoRoot: f.root, args: { apply: true, message: 'Candidate test' } }, f.dependencies), /Native mismatch/);
  assert.ok(!f.calls.some(c => c[0] === 'update'));
});
test('native check precedes candidate upload and server fingerprint is rechecked', async t => {
  const f = fixture(t);
  const result = await runCandidate({ repoRoot: f.root, args: { apply: true, message: 'Candidate test' } }, f.dependencies);
  for (const suffix of ['-native-preflight.json', '-publish.log', '-candidate.json']) t.after(() => fs.rmSync(f.root + suffix, { force: true }));
  assert.equal(result.apply, true);
  assert.ok(f.calls.findIndex(c => c[0] === 'native-local') < f.calls.findIndex(c => c[0] === 'update'));
  assert.ok(f.calls.findIndex(c => c[0] === 'update') < f.calls.findIndex(c => c[0] === 'native-preview'));
  assert.equal(f.calls.filter(c => c[0] === 'update').length, 1);
});

test('Android candidate uses the Android baseline and uploads only Android', async t => {
  const f = fixture(t);
  f.updates[0].platform = 'android';
  f.dependencies.verifyLocalNative = ({ baseline }) => {
    assert.equal(baseline.platform, 'android');
    assert.equal(baseline.buildNumber, '10');
    return { fingerprint: 'b'.repeat(40) };
  };
  const result = await runCandidate({ repoRoot: f.root, args: parseArgs(['--platform', 'android', '--apply', '--message', 'Android release']) }, f.dependencies);
  for (const suffix of ['-native-preflight.json', '-publish.log', '-candidate.json']) t.after(() => fs.rmSync(f.root + suffix, { force: true }));
  assert.equal(result.apply, true);
  const upload = f.calls.find(c => c[0] === 'update');
  assert.equal(upload[upload.indexOf('--platform') + 1], 'android');
  assert.throws(() => parseArgs(['--platform', 'all']), /platform/);
  assert.throws(() => parseArgs(['--platform']), /platform/);
});
