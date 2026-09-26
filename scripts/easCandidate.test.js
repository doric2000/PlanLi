const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseArgs, runCandidate } = require('./easCandidate');
const { fixture } = require('./testFixtures/easRelease');

test('candidate command is read-only by default and rejects a skip-native argument', () => {
  assert.deepEqual(parseArgs([]), { apply: false, message: '' });
  assert.throws(() => parseArgs(['--skip-native']), /Unknown candidate argument/);
  assert.equal(parseArgs(['--source-record', 'source.json']).sourceRecord, 'source.json');
  assert.throws(() => parseArgs(['--source-record']), /requires a path/);
  assert.throws(() => parseArgs(['--source-record', '--apply']), /requires a path/);
});

test('reusing a source still runs native and published-artifact checks', async t => {
  const f = fixture(t);
  const originalPrepare = f.dependencies.prepareSource;
  f.dependencies.prepareSource = ({ sourceRecord }) => {
    assert.equal(sourceRecord, 'existing-source.json');
    return { ...originalPrepare(), recordPath: sourceRecord };
  };
  const result = await runCandidate({ repoRoot: f.root, args: { apply: true, message: 'Reuse source', sourceRecord: 'existing-source.json' } }, f.dependencies);
  for (const suffix of ['-native-preflight.json', '-publish.log', '-candidate.json']) t.after(() => fs.rmSync(f.root + suffix, { force: true }));
  assert.equal(result.sourceRecord, 'existing-source.json');
  assert.deepEqual(f.calls.filter(c => ['native-local', 'native-preview', 'artifact'].includes(c[0])).map(c => c[0]), ['native-local', 'native-preview', 'artifact']);
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
    assert.equal(baseline.buildNumber, '12');
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
