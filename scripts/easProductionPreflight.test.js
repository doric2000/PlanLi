const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolvePlatformLineage,
  easExecutable,
  easExecOptions,
  parseArgs,
  resolveProductionLineage,
  validateDeployedCommit,
  validateRepositoryState,
  validateRootConfigFiles,
} = require('./easProductionPreflight');

test('first Android OTA uses a reviewed embedded source only for an empty inventory', () => {
  const baseline = { platform: 'android', sourceCommit: 'a'.repeat(40), buildId: 'build-10' };
  assert.deepEqual(resolvePlatformLineage([], () => [], 'android', baseline), {
    deployedCommit: baseline.sourceCommit, groupId: 'embedded-build:build-10',
  });
  assert.throws(() => resolvePlatformLineage(undefined, () => [], 'android', baseline), /inventory/);
  assert.throws(() => resolvePlatformLineage([], () => [], 'android'), /reviewed embedded/);
  assert.throws(() => resolvePlatformLineage([], () => [], 'ios', baseline), /reviewed embedded/);
  assert.deepEqual(resolvePlatformLineage([{ group: 'ota' }], () => [
    { platform: 'ios', gitCommitHash: 'b'.repeat(40) },
    { platform: 'android', gitCommitHash: 'c'.repeat(40) },
  ], 'android', baseline), { deployedCommit: 'c'.repeat(40), groupId: 'ota' });
  assert.throws(() => resolvePlatformLineage([{ group: 'bad' }], () => [], 'android', baseline), /No production update/);
});

test('first iOS OTA on a new runtime requires a verified matching embedded baseline', () => {
  const baseline = { platform: 'ios', sourceCommit: 'd'.repeat(40), buildId: 'new-ios-build' };
  assert.deepEqual(resolvePlatformLineage([], () => [], 'ios', baseline), {
    deployedCommit: baseline.sourceCommit, groupId: 'embedded-build:new-ios-build',
  });
  for (const invalid of [undefined, { ...baseline, sourceCommit: '' }, { ...baseline, buildId: '' }, { ...baseline, platform: 'android' }]) {
    assert.throws(() => resolvePlatformLineage([], () => [], 'ios', invalid), /reviewed embedded/);
  }
  assert.throws(() => resolvePlatformLineage([{ group: 'bad' }], () => [], 'ios', baseline), /No production update/);
});
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('uses the installed EAS launcher for each platform', () => {
  assert.equal(easExecutable('win32'), 'eas.cmd');
  assert.equal(easExecutable('linux'), 'eas');
  assert.equal(easExecOptions('win32').shell, true);
  assert.equal(easExecOptions('linux').shell, false);
});

test('accepts a clean main checkout synchronized with origin', () => {
  assert.doesNotThrow(() => validateRepositoryState({
    branch: 'main',
    head: 'a'.repeat(40),
    originMain: 'a'.repeat(40),
    status: '',
  }));
});

test('rejects feature branches, dirty files, and stale main checkouts', () => {
  assert.throws(() => validateRepositoryState({
    branch: 'fix/photo', head: 'a', originMain: 'a', status: '',
  }), /must run from main/);
  assert.throws(() => validateRepositoryState({
    branch: 'main', head: 'a', originMain: 'a', status: '?? local.png',
  }), /completely clean checkout/);
  assert.throws(() => validateRepositoryState({
    branch: 'main', head: 'a', originMain: 'b', status: '',
  }), /exactly match origin\/main/);
});

test('requires the currently deployed commit to be an ancestor', () => {
  assert.doesNotThrow(() => validateDeployedCommit({
    deployedCommit: 'a'.repeat(40), head: 'b'.repeat(40), isAncestor: true,
  }));
  assert.throws(() => validateDeployedCommit({
    deployedCommit: 'a'.repeat(40), head: 'b'.repeat(40), isAncestor: false,
  }), /Refusing to replace production/);
});

test('walks past a rollback-to-embedded group to the last code-bearing production update', () => {
  const rollbackGroup = '11111111-2222-4333-8444-555555555555';
  const codeGroup = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const commit = 'a'.repeat(40);
  const result = resolveProductionLineage([
    { group: rollbackGroup, isRollBackToEmbedded: true },
    { group: codeGroup, isRollBackToEmbedded: false },
  ], (groupId) => groupId === rollbackGroup ? [{ group: groupId }] : [{
    group: groupId,
    gitCommitHash: commit,
  }]);
  assert.deepEqual(result, { deployedCommit: commit, groupId: codeGroup });
});

test('accepts only the explicit deployed-commit argument', () => {
  assert.deepEqual(parseArgs(['--deployed-commit', 'abc1234']), { deployedCommit: 'abc1234' });
  assert.throws(() => parseArgs(['--force']), /Unknown argument/);
});

test('rejects stray root Expo and EAS configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-eas-root-'));
  try {
    assert.doesNotThrow(() => validateRootConfigFiles(root));
    fs.writeFileSync(path.join(root, 'app.json'), '{}');
    assert.throws(() => validateRootConfigFiles(root), /must live under client/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
