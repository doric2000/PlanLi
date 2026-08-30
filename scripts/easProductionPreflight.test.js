const test = require('node:test');
const assert = require('node:assert/strict');

const {
  easExecutable,
  easExecOptions,
  parseArgs,
  validateDeployedCommit,
  validateRepositoryState,
  validateRootConfigFiles,
} = require('./easProductionPreflight');
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
