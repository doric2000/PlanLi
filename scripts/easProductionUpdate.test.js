const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendReleaseRecord,
  extractReleaseMetadata,
  parseArgs,
  validateConfirmation,
  validateEasIdentity,
  validateEasVersion,
  validateMessage,
  validatePreviewGroupId,
  validatePreviewUpdates,
  validateReleaseConfiguration,
} = require('./easProductionUpdate');

const head = 'a'.repeat(40);
const previewGroup = '11111111-2222-4333-8444-555555555555';
const productionGroup = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function configuration() {
  return {
    app: {
      owner: 'doric2000',
      version: '1.1.0',
      runtimeVersion: '1.2.0',
      updates: { url: 'https://u.expo.dev/04731493-708f-4c82-b417-6ea815ea912e' },
      extra: { eas: { projectId: '04731493-708f-4c82-b417-6ea815ea912e' } },
    },
    eas: {
      cli: { version: '22.6.0' },
      build: {
        production: {
          channel: 'production',
          environment: 'production',
          env: { PLANLI_ENV: 'production' },
        },
      },
    },
  };
}

function update(group = previewGroup, overrides = {}) {
  return {
    branch: 'staging',
    createdAt: '2026-08-28T10:00:00.000Z',
    gitCommitHash: head,
    group,
    runtimeVersion: '1.2.0',
    ...overrides,
  };
}

test('parses only explicit release arguments and remains dry-run by default', () => {
  assert.deepEqual(parseArgs([
    '--preview-group', previewGroup,
    '--message', 'Security release',
    '--deployed-commit', 'abc1234',
  ]), {
    apply: false,
    confirmation: '',
    deployedCommit: 'abc1234',
    message: 'Security release',
    previewGroup,
  });
  assert.throws(() => parseArgs(['--force']), /Unknown argument/);
});

test('requires an exact commit-bound confirmation only for apply', () => {
  assert.doesNotThrow(() => validateConfirmation({ apply: false, confirmation: '', head }));
  assert.doesNotThrow(() => validateConfirmation({
    apply: true,
    confirmation: `PUBLISH PRODUCTION ${head.slice(0, 12)}`,
    head,
  }));
  assert.throws(() => validateConfirmation({ apply: true, confirmation: 'yes', head }), /requires --confirm/);
});

test('rejects multiline messages, invalid group IDs, account drift, and CLI drift', () => {
  assert.doesNotThrow(() => validateMessage('Security release'));
  assert.throws(() => validateMessage('bad\nheading'), /printable line/);
  assert.doesNotThrow(() => validatePreviewGroupId(previewGroup));
  assert.throws(() => validatePreviewGroupId('latest'), /valid explicit preview/);
  assert.doesNotThrow(() => validateEasIdentity('doric2000\n'));
  assert.doesNotThrow(() => validateEasIdentity('doric2000\ndoric9@gmail.com\n'));
  assert.throws(() => validateEasIdentity('another-account'), /authenticated as doric2000/);
  assert.throws(() => validateEasIdentity('doric2000\nunexpected output'), /authenticated as doric2000/);
  assert.doesNotThrow(() => validateEasVersion('eas-cli/22.6.0 win32-x64 node-v22.23.1'));
  assert.throws(() => validateEasVersion('eas-cli/23.0.0'), /must be 22.6.0/);
});

test('pins owner, project, runtime, channel, environment, and CLI configuration', () => {
  assert.doesNotThrow(() => validateReleaseConfiguration(configuration()));
  const wrongProject = configuration();
  wrongProject.app.extra.eas.projectId = 'different-project';
  assert.throws(() => validateReleaseConfiguration(wrongProject), /EAS project must remain/);
  const wrongEnvironment = configuration();
  wrongEnvironment.eas.build.production.environment = 'preview';
  assert.throws(() => validateReleaseConfiguration(wrongEnvironment), /production channel and environment/);
});

test('accepts only the exact candidate commit and runtime in the selected preview group', () => {
  assert.equal(validatePreviewUpdates({ value: [update()], groupId: previewGroup, head }).length, 1);
  assert.throws(() => validatePreviewUpdates({
    value: [update(previewGroup, { gitCommitHash: 'b'.repeat(40) })],
    groupId: previewGroup,
    head,
  }), /only candidate commit/);
  assert.throws(() => validatePreviewUpdates({
    value: [update(previewGroup, { runtimeVersion: '1.1.0' })],
    groupId: previewGroup,
    head,
  }), /only runtime 1.2.0/);
  assert.throws(() => validatePreviewUpdates({
    value: [update(previewGroup, { branch: 'production' })],
    groupId: previewGroup,
    head,
  }), /only from the staging branch/);
});

test('extracts one production group and rejects ambiguous publish output', () => {
  const metadata = extractReleaseMetadata([
    update(productionGroup, { branch: { name: 'production' }, runtimeVersion: undefined, runtime: { version: '1.2.0' } }),
    update(productionGroup, {
      branch: { name: 'production' },
      createdAt: '2026-08-28T10:00:01.000Z',
      runtimeVersion: undefined,
      runtime: { version: '1.2.0' },
    }),
  ], { head });
  assert.deepEqual(metadata, {
    channel: 'production',
    commit: head,
    createdAt: '2026-08-28T10:00:01.000Z',
    environment: 'production',
    groupId: productionGroup,
    runtime: '1.2.0',
  });
  assert.throws(() => extractReleaseMetadata([
    update(productionGroup),
    update('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'),
  ], { head }), /one update group/);
});

test('records a release once and leaves physical verification explicitly pending', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-ota-record-'));
  const readme = path.join(directory, 'README.md');
  const metadata = extractReleaseMetadata([update(productionGroup)], { head });
  const artifact = {
    bytes: 12345,
    sha256: 'A'.repeat(64),
    updateId: '01a05f00-0000-7000-8000-000000000000',
  };
  try {
    fs.writeFileSync(readme, '# PlanLi\n', 'utf8');
    appendReleaseRecord(readme, metadata, 'Security release', artifact);
    const result = fs.readFileSync(readme, 'utf8');
    assert.match(result, new RegExp(productionGroup));
    assert.match(result, new RegExp(artifact.sha256));
    assert.match(result, /security smoke tests: pending/);
    assert.throws(() => appendReleaseRecord(readme, metadata, 'Security release', artifact), /already records/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
