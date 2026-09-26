const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendReleaseRecord,
  buildRepublishCommand,
  extractReleaseMetadata,
  parseArgs,
  parseRepublishedGroupId,
  validateConfirmation,
  validateEasIdentity,
  validateEasVersion,
  validateMessage,
  validatePreviewGroupId,
  validatePreviewUpdates,
  validateReleaseConfiguration,
  runRelease,
} = require('./easProductionUpdate');
const { fixture } = require('./testFixtures/easRelease');

const head = 'a'.repeat(40);
const previewGroup = '11111111-2222-4333-8444-555555555555';
const productionGroup = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('Android promotion rejects iOS candidates and preserves its platform through republish', async t => {
  const f = fixture(t);
  const args = { platform: 'android', apply: true, confirmation: `PUBLISH PRODUCTION ${f.head.slice(0, 12)}`, previewGroup: f.group, message: 'Android update' };
  await assert.rejects(runRelease({ repoRoot: f.root, args }, f.dependencies), /exactly one android/);
  f.updates[0].platform = 'android';
  f.dependencies.runPreflight = () => ({ head: f.head, deployedCommit: 'c'.repeat(40), groupId: 'embedded-build:build-10' });
  const original = f.dependencies.createEasRunner();
  let republished = false;
  f.dependencies.createEasRunner = () => command => {
    if (command[0] === 'update:republish') {
      assert.equal(command[command.indexOf('--platform') + 1], 'android');
      republished = true;
      return `Update group ID ${productionGroup}`;
    }
    if (command[0] === 'update:view' && republished) return JSON.stringify([{ ...f.updates[0], group: productionGroup, branch: 'production' }]);
    return original(command);
  };
  f.dependencies.verifyArtifact = async (_updates, _group, _fetch, platform) => {
    assert.equal(platform, 'android');
    return { sha256: 'same-bundle', updateId: 'android-update', bytes: 1 };
  };
  const result = await runRelease({ repoRoot: f.root, args }, f.dependencies);
  assert.equal(result.metadata.platform, 'android');
  assert.match(fs.readFileSync(path.join(f.root, 'README.md'), 'utf8'), /Android production OTA release/);
  assert.match(fs.readFileSync(path.join(f.root, 'README.md'), 'utf8'), /no previous android OTA/);
});

test('production promotion is blocked before republish on a native mismatch', async t => {
  const f = fixture(t);
  f.dependencies.verifyPreviewNative = () => { throw new Error('Unreviewed native fingerprint'); };
  await assert.rejects(runRelease({ repoRoot: f.root, args: { apply: true,
    confirmation: `PUBLISH PRODUCTION ${f.head.slice(0, 12)}`, previewGroup: f.group, message: 'Native guard test' } }, f.dependencies), /Unreviewed native fingerprint/);
  assert.ok(!f.calls.some(c => ['update:republish', 'artifact'].includes(c[0])));
});

test('production dry run checks native compatibility without republishing', async t => {
  const f = fixture(t);
  const result = await runRelease({ repoRoot: f.root, args: { apply: false, previewGroup: f.group, message: 'Native guard test' } }, f.dependencies);
  assert.equal(result.native.status, 'exact');
  assert.ok(f.calls.some(c => c[0] === 'native-preview'));
  assert.ok(!f.calls.some(c => c[0] === 'update:republish'));
});

test('promotion accepts a prepared source without skipping native or artifact verification', async t => {
  const f = fixture(t);
  assert.throws(() => parseArgs(['--source-record']), /requires a path/);
  assert.throws(() => parseArgs(['--source-record', '--apply']), /requires a path/);
  const args = parseArgs(['--source-record', 'existing-source.json', '--preview-group', f.group, '--message', 'Reuse source']);
  const originalPrepare = f.dependencies.prepareSource;
  f.dependencies.prepareSource = ({ sourceRecord }) => {
    assert.equal(sourceRecord, 'existing-source.json');
    return { ...originalPrepare(), recordPath: sourceRecord };
  };
  const result = await runRelease({ repoRoot: f.root, args }, f.dependencies);
  assert.equal(result.sourceRecord, 'existing-source.json');
  assert.deepEqual(f.calls.filter(c => ['native-preview', 'artifact'].includes(c[0])).map(c => c[0]), ['native-preview', 'artifact']);
});

function configuration() {
  return {
    app: {
      owner: 'doric2000',
      version: '1.1.0',
      ios: { version: '1.1.3' },
      runtimeVersion: '1.4.0',
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
    platform: 'ios',
    createdAt: '2026-08-28T10:00:00.000Z',
    gitCommitHash: head,
    group,
    runtimeVersion: '1.4.0',
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

test('republishes the verified candidate for iOS only', () => {
  assert.deepEqual(buildRepublishCommand({
    previewGroup,
    message: 'Security release',
  }), [
    'update:republish',
    '--group', previewGroup,
    '--destination-channel', 'production',
    '--platform', 'ios',
    '--message', 'Security release',
    '--non-interactive',
  ]);
});

test('reads the production group from successful EAS text output', () => {
  assert.equal(parseRepublishedGroupId(
    'Platform         ios\nUpdate group ID  aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\n'
  ), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.throws(() => parseRepublishedGroupId('Republish failed'), /valid explicit preview/);
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
  const oldRuntime = configuration();
  oldRuntime.app.runtimeVersion = '1.2.0';
  assert.throws(() => validateReleaseConfiguration(oldRuntime), /runtime 1.4.0/);
  const oldIosVersion = configuration();
  oldIosVersion.app.ios.version = '1.1.0';
  assert.throws(() => validateReleaseConfiguration(oldIosVersion), /marketing version 1.1.3/);
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
  }), /only runtime 1.4.0/);
  assert.throws(() => validatePreviewUpdates({
    value: [update(previewGroup, { branch: 'production' })],
    groupId: previewGroup,
    head,
  }), /only from the staging branch/);
});

test('extracts one production group and rejects ambiguous publish output', () => {
  const metadata = extractReleaseMetadata([
    update(productionGroup, { branch: { name: 'production' }, runtimeVersion: undefined, runtime: { version: '1.4.0' } }),
    update(productionGroup, {
      branch: { name: 'production' },
      createdAt: '2026-08-28T10:00:01.000Z',
      runtimeVersion: undefined,
      runtime: { version: '1.4.0' },
    }),
  ], { head });
  assert.deepEqual(metadata, {
    channel: 'production',
    commit: head,
    createdAt: '2026-08-28T10:00:01.000Z',
    environment: 'production',
    groupId: productionGroup,
    runtime: '1.4.0',
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
