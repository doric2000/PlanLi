const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizedHash, parseEasJson, readBaseline, validateBuild, validateFingerprint, previewNativeMetadata, verifyLocalNative } = require('./easNativeCompatibility');
const { fixture } = require('./testFixtures/easRelease');
const fs = require('node:fs');
const path = require('node:path');
const baseline = { buildId: 'installed-build', projectId: 'project', buildNumber: '30', runtime: '1.3.0', channel: 'production', fingerprint: 'a'.repeat(40),
  reviewedOptionalDelta: { fingerprint: 'b'.repeat(40), module: 'Optional', review: 'review.md',
    requiredSources: { 'client/modules/optional/index.js': normalizedHash(Buffer.from('optional import\n')) } } };
const build = { id: 'installed-build', app: { id: 'project' }, platform: 'IOS', status: 'FINISHED', appBuildVersion: '30',
  runtime: { version: '1.3.0' }, updateChannel: { name: 'production' }, fingerprint: { hash: baseline.fingerprint } };
const check = (hash, content = 'optional import\n') => validateFingerprint({ hash, baseline, sourceRoot: '/source', readFile: () => Buffer.from(content) });

test('CLI environment preamble is separated from complete JSON without exposing it on errors', () => {
  assert.deepEqual(parseEasJson('Environment variables loaded\n{\n  "hash": "abc"\n}\n'), { hash: 'abc' });
  assert.deepEqual(parseEasJson('[{"id":"build"}]'), [{ id: 'build' }]);
  for (const bad of ['private-env-value\n{invalid}', 'private-env-value\n{"hash":"abc"}\ntrailing text']) {
    assert.throws(() => parseEasJson(bad), error => error.message === 'EAS did not return one complete JSON result.');
  }
});

test('baseline identity must agree with actual app configuration', t => {
  const f = fixture(t);
  const actual = readBaseline(f.root);
  fs.writeFileSync(path.join(f.root, 'config/eas-ios-native-baseline.json'), JSON.stringify({ ...actual, runtime: 'different' }));
  assert.throws(() => readBaseline(f.root), /does not match the configured/);
});

test('the exact installed fingerprint is accepted, missing and unknown hashes fail closed', () => {
  assert.equal(check(baseline.fingerprint).status, 'exact');
  assert.throws(() => check(null), /Missing or invalid/);
  assert.throws(() => check('c'.repeat(40)), /Unreviewed/);
});
test('a reviewed optional delta requires unchanged fallback source, including on Windows', () => {
  assert.equal(check('b'.repeat(40), 'optional import\r\n').status, 'reviewed-optional-module');
  assert.equal(check('b'.repeat(40)).nativeFeatureEnabled, false);
  assert.throws(() => check('b'.repeat(40), 'required import\n'), /review is stale/);
});
test('an empty reviewed-source record cannot silently authorize a mismatch', () => {
  assert.throws(() => validateFingerprint({ hash: 'b'.repeat(40), sourceRoot: '/source',
    baseline: { ...baseline, reviewedOptionalDelta: { ...baseline.reviewedOptionalDelta, requiredSources: {} } } }), /Unreviewed/);
});
test('build identity, platform, status, runtime, channel and fingerprint are bound', () => {
  assert.doesNotThrow(() => validateBuild(build, baseline));
  for (const override of [{ id: 'different' }, { app: { id: 'different' } }, { platform: 'ANDROID' }, { status: 'ERRORED' },
    { appBuildVersion: '31' }, { runtime: { version: '1.4.0' } }, { updateChannel: { name: 'staging' } }, { fingerprint: null }]) {
    assert.throws(() => validateBuild({ ...build, ...override }, baseline), /baseline does not match/);
  }
});
test('preview metadata requires one match and the production environment', () => {
  const update = { id: 'update', environment: 'production', fingerprint: { hash: 'a'.repeat(40) } };
  assert.equal(previewNativeMetadata({ updates: [update] }, 'update'), update);
  assert.throws(() => previewNativeMetadata({}, 'update'), /exactly one/);
  assert.throws(() => previewNativeMetadata([update, update], 'update'), /exactly one/);
  assert.throws(() => previewNativeMetadata({ ...update, environment: 'preview' }, 'update'), /production environment/);
});
test('local compatibility is computed explicitly with production variables, without an update/export', () => {
  const commands = [];
  const result = verifyLocalNative({ baseline, sourceRoot: '/source', runEas(args) {
    commands.push(args);
    return JSON.stringify(args[0] === 'build:view' ? build : { hash: baseline.fingerprint });
  } });
  assert.equal(result.status, 'exact');
  assert.deepEqual(commands, [['build:view', 'installed-build', '--json'],
    ['fingerprint:generate', '--platform', 'ios', '--environment', 'production', '--json', '--non-interactive']]);
});
