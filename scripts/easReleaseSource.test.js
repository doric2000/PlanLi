const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { nativeMetadataBytes, prepareSource, verifySource } = require('./easReleaseSource');
const { fixture } = require('./testFixtures/easRelease');
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

test('only line endings are normalized and a real native metadata edit is rejected', () => {
  const expected = Buffer.from('build metadata\r\n');
  assert.deepEqual(nativeMetadataBytes(Buffer.from('build metadata\n'), sha1(expected), 'metadata'), expected);
  assert.deepEqual(nativeMetadataBytes(expected, sha1(expected), 'metadata'), expected);
  assert.throws(() => nativeMetadataBytes(Buffer.from('changed metadata\n'), sha1(expected), 'metadata'), /content changed/);
});
test('a tracked Git archive excludes unrelated root config and detects source tampering', t => {
  const f = fixture(t);
  const git = args => execFileSync('git', args, { cwd: f.root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q']);
  git(['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(f.root, 'client/.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(f.root, 'client/example.txt'), 'unchanged\n');
  git(['add', '--', 'README.md', 'client/app.json', 'client/eas.json', 'client/.gitignore', 'client/example.txt', 'config/eas-ios-native-baseline.json']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture']);
  fs.mkdirSync(path.join(f.root, 'client/node_modules'));
  fs.writeFileSync(path.join(f.root, 'app.json'), '{"unrelated":true}');
  const baseline = { metadataCrlfSha1: { 'client/.gitignore': sha1(Buffer.from('node_modules/\r\n')) } };
  const source = prepareSource({ repoRoot: f.root, baseline });
  assert.equal(fs.existsSync(path.join(source.sourceRoot, 'app.json')), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'app.json'), 'utf8'), '{"unrelated":true}');
  assert.equal(fs.readFileSync(path.join(source.sourceRoot, 'client/.gitignore'), 'utf8'), 'node_modules/\r\n');
  assert.equal(verifySource(source).trackedFiles, 6);
  fs.writeFileSync(path.join(source.sourceRoot, 'client/example.txt'), 'changed\n');
  assert.throws(() => verifySource(source), /Archived source mismatch/);
  git(['add', '--', 'app.json']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'invalid root config fixture']);
  assert.throws(() => prepareSource({ repoRoot: f.root, baseline }), /must live under client/);
});
