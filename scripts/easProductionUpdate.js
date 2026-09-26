const fs = require('node:fs');
const path = require('node:path');

const {
  runPreflight,
} = require('./easProductionPreflight');
const { verifyProductionUpdateArtifact } = require('./easUpdateArtifact');
const { prepareSource, createEasRunner } = require('./easReleaseSource');
const { releasePlatform, readBaseline, verifyPreviewNative } = require('./easNativeCompatibility');

const EXPECTED_ACCOUNT = 'doric2000';
const EXPECTED_OWNER = 'doric2000';
const EXPECTED_PROJECT_ID = '04731493-708f-4c82-b417-6ea815ea912e';
const EXPECTED_CHANNEL = 'production';
const EXPECTED_ENVIRONMENT = 'production';
const EXPECTED_MARKETING_VERSION = '1.1.3';
const EXPECTED_RUNTIME = '1.4.0';
const EXPECTED_CLI_VERSION = '22.6.0';
const EXPECTED_STAGING_BRANCH = 'staging';

function fail(message) {
  const error = new Error(message);
  error.code = 'EAS_PRODUCTION_UPDATE_FAILED';
  throw error;
}

function parseArgs(argv) {
  const args = {
    apply: false,
    confirmation: '',
    deployedCommit: '',
    message: '',
    previewGroup: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') {
      args.apply = true;
    } else if (value === '--platform') {
      args.platform = releasePlatform(argv[++index] || '');
    } else if (value === '--confirm') {
      args.confirmation = String(argv[index + 1] || '').trim();
      index += 1;
    } else if (value === '--deployed-commit') {
      args.deployedCommit = String(argv[index + 1] || '').trim();
      index += 1;
    } else if (value === '--message') {
      args.message = String(argv[index + 1] || '').trim();
      index += 1;
    } else if (value === '--preview-group') {
      args.previewGroup = String(argv[index + 1] || '').trim();
      index += 1;
    } else if (value === '--source-record') {
      args.sourceRecord = argv[++index];
      if (!args.sourceRecord || args.sourceRecord.startsWith('--')) fail('--source-record requires a path.');
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function validateMessage(message) {
  if (message.length < 5 || message.length > 200) {
    fail('The release message must contain between 5 and 200 characters.');
  }
  if (/\r|\n|[\u0000-\u001f\u007f]/u.test(message)) {
    fail('The release message must be one printable line.');
  }
}

function validatePreviewGroupId(groupId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) {
    fail('A valid explicit preview update group ID is required.');
  }
}

function validateConfirmation({ apply, confirmation, head }) {
  if (!apply) return;
  const expected = `PUBLISH PRODUCTION ${head.slice(0, 12)}`;
  if (confirmation !== expected) {
    fail(`Production apply requires --confirm "${expected}".`);
  }
}

function validateEasIdentity(output) {
  const lines = String(output || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const account = lines[0] || '';
  const supplementalIdentity = lines.slice(1);
  const validSupplementalIdentity = supplementalIdentity.length <= 1
    && supplementalIdentity.every((line) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(line));
  if (account !== EXPECTED_ACCOUNT || !validSupplementalIdentity) {
    fail(`EAS must be authenticated as ${EXPECTED_ACCOUNT}; found ${account || 'no account'}.`);
  }
}

function validateEasVersion(output) {
  const match = String(output || '').match(/eas-cli\/(\d+\.\d+\.\d+)/);
  if (match?.[1] !== EXPECTED_CLI_VERSION) {
    fail(`EAS CLI must be ${EXPECTED_CLI_VERSION}; found ${match?.[1] || 'unknown'}.`);
  }
}

function readReleaseConfiguration(repoRoot) {
  const clientRoot = path.join(repoRoot, 'client');
  return {
    app: JSON.parse(fs.readFileSync(path.join(clientRoot, 'app.json'), 'utf8')).expo,
    eas: JSON.parse(fs.readFileSync(path.join(clientRoot, 'eas.json'), 'utf8')),
  };
}

function validateReleaseConfiguration({ app, eas }, platform = 'ios', baseline) {
  releasePlatform(platform);
  if (app.owner !== EXPECTED_OWNER) fail(`Expo owner must remain ${EXPECTED_OWNER}.`);
  if (app.extra?.eas?.projectId !== EXPECTED_PROJECT_ID) {
    fail(`EAS project must remain ${EXPECTED_PROJECT_ID}.`);
  }
  if (app.updates?.url !== `https://u.expo.dev/${EXPECTED_PROJECT_ID}`) {
    fail('The EAS Update URL does not match the reviewed project.');
  }
  const expectedVersion = baseline ? (baseline.iosVersion || baseline.appVersion) : platform === 'ios' ? EXPECTED_MARKETING_VERSION : '1.1.0';
  const expectedRuntime = baseline?.runtime || EXPECTED_RUNTIME;
  if ((app[platform]?.version || app.version) !== expectedVersion || (app[platform]?.runtimeVersion || app.runtimeVersion) !== expectedRuntime) {
    fail(`The ${platform} release must use marketing version ${expectedVersion} and runtime ${expectedRuntime}.`);
  }
  const production = eas.build?.production || {};
  if (production.channel !== EXPECTED_CHANNEL || production.environment !== EXPECTED_ENVIRONMENT) {
    fail('The production EAS profile must use the production channel and environment.');
  }
  if (production.env?.PLANLI_ENV !== 'production') {
    fail('The production EAS profile must identify PLANLI_ENV as production.');
  }
  if (eas.cli?.version !== EXPECTED_CLI_VERSION) {
    fail(`eas.json must pin EAS CLI ${EXPECTED_CLI_VERSION}.`);
  }
}

function normalizeUpdates(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.updates)) return value.updates;
  return [];
}

function updateBranch(update) {
  return String(update?.branch?.name || update?.branch || '').trim();
}

function updateRuntime(update) {
  return String(update?.runtime?.version || update?.runtimeVersion || '').trim();
}

function validatePreviewUpdates({ value, groupId, head, platform = 'ios', runtime = EXPECTED_RUNTIME }) {
  releasePlatform(platform);
  const updates = normalizeUpdates(value);
  if (updates.length !== 1 || updates[0].platform !== platform) fail(`Preview group ${groupId} must contain exactly one ${platform} update.`);
  const commits = new Set(updates.map((update) => String(update?.gitCommitHash || '').trim()));
  const branches = new Set(updates.map(updateBranch));
  const runtimes = new Set(updates.map(updateRuntime));
  const groups = new Set(updates.map((update) => String(update?.group || groupId).trim()));
  if (commits.size !== 1 || !commits.has(head)) {
    fail(`Preview group ${groupId} must contain only candidate commit ${head}.`);
  }
  if (runtimes.size !== 1 || !runtimes.has(runtime)) {
    fail(`Preview group ${groupId} must contain only runtime ${runtime}.`);
  }
  if (branches.size !== 1 || !branches.has(EXPECTED_STAGING_BRANCH)) {
    fail(`Preview group ${groupId} must come only from the ${EXPECTED_STAGING_BRANCH} branch.`);
  }
  if (groups.size !== 1 || !groups.has(groupId)) {
    fail(`Preview response does not match requested group ${groupId}.`);
  }
  return updates;
}

function extractReleaseMetadata(value, fallback = {}) {
  const updates = normalizeUpdates(value);
  const groupIds = [...new Set(updates.map((update) => String(update?.group || '').trim()).filter(Boolean))];
  const commits = [...new Set(updates.map((update) => String(update?.gitCommitHash || '').trim()).filter(Boolean))];
  const runtimes = [...new Set(updates.map(updateRuntime).filter(Boolean))];
  const timestamps = updates
    .map((update) => String(update?.createdAt || '').trim())
    .filter(Boolean)
    .sort();
  if (groupIds.length !== 1) fail('Republish response does not identify one update group.');
  if (commits.length && (commits.length !== 1 || commits[0] !== fallback.head)) {
    fail('Republished update metadata does not match the candidate commit.');
  }
  if (runtimes.length !== 1 || runtimes[0] !== (fallback.runtime || EXPECTED_RUNTIME)) {
    fail(`Republished update metadata does not match runtime ${fallback.runtime || EXPECTED_RUNTIME}.`);
  }
  return {
    channel: EXPECTED_CHANNEL,
    commit: commits[0] || fallback.head,
    createdAt: timestamps.at(-1) || new Date().toISOString(),
    environment: EXPECTED_ENVIRONMENT,
    groupId: groupIds[0],
    runtime: runtimes[0],
  };
}

function formatReleaseRecord(metadata, message, artifact) {
  return [
    '',
    `## ${metadata.platform === 'android' ? 'Android' : 'iOS'} production OTA release`,
    '',
    `- Source commit: \`${metadata.commit}\`.`,
    `- EAS Update group: \`${metadata.groupId}\`; channel \`${metadata.channel}\`; runtime \`${metadata.runtime}\`.`,
    `- EAS environment: \`${metadata.environment}\`; published at \`${metadata.createdAt}\`.`,
    `- Immutable ${metadata.platform === 'android' ? 'Android' : 'iOS'} launch bundle: update \`${artifact.updateId}\`; ${artifact.bytes} bytes; SHA-256 \`${artifact.sha256}\`.`,
    `- Message: ${message}`,
    '- Device application and post-update security smoke tests: pending.',
    metadata.previousGroupId?.startsWith('embedded-build:')
      ? `- Rollback: no previous ${metadata.platform} OTA; an authorized rollback must target the embedded build for runtime ${metadata.runtime}.`
      : '- Rollback: republish the immediately preceding verified production group; never change the runtime URL or channel in-app.',
    '',
  ].join('\n');
}

function appendReleaseRecord(readmePath, metadata, message, artifact) {
  const current = fs.readFileSync(readmePath, 'utf8');
  if (current.includes(metadata.groupId)) fail(`README already records update group ${metadata.groupId}.`);
  fs.appendFileSync(readmePath, formatReleaseRecord(metadata, message, artifact), 'utf8');
}

function buildRepublishCommand({ previewGroup, message, platform = 'ios' }) {
  releasePlatform(platform);
  return [
    'update:republish',
    '--group', previewGroup,
    '--destination-channel', EXPECTED_CHANNEL,
    '--platform', platform,
    '--message', message,
    '--non-interactive',
  ];
}

function parseRepublishedGroupId(output) {
  const groupId = String(output || '').match(
    /Update group ID\s+([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/iu
  )?.[1] || '';
  validatePreviewGroupId(groupId);
  return groupId;
}

async function runRelease({ repoRoot, args }, dependencies = {}) {
  validateMessage(args.message);
  validatePreviewGroupId(args.previewGroup);
  const platform = releasePlatform(args.platform);
  const baseline = readBaseline(repoRoot, platform);
  validateReleaseConfiguration(readReleaseConfiguration(repoRoot), platform);
  const preflight = (dependencies.runPreflight || runPreflight)({ repoRoot, deployedCommit: args.deployedCommit, archive: true, platform, baseline });
  validateConfirmation({ ...args, head: preflight.head });

  const source = (dependencies.prepareSource || prepareSource)({ repoRoot, baseline, sourceRecord: args.sourceRecord });
  const runEas = (dependencies.createEasRunner || createEasRunner)(source);
  validateEasVersion(runEas(['--version']));
  validateEasIdentity(runEas(['whoami']));
  const preview = JSON.parse(runEas(['update:view', args.previewGroup, '--json']));
  validatePreviewUpdates({ value: preview, groupId: args.previewGroup, head: preflight.head, platform });
  const native = (dependencies.verifyPreviewNative || verifyPreviewNative)({ runEas, baseline, sourceRoot: source.sourceRoot, update: normalizeUpdates(preview)[0] });
  const verifyArtifact = dependencies.verifyArtifact || verifyProductionUpdateArtifact;
  const previewArtifact = await verifyArtifact(preview, args.previewGroup, undefined, platform);

  const command = buildRepublishCommand({
    previewGroup: args.previewGroup,
    platform,
    message: args.message,
  });
  if (!args.apply) {
    return { apply: false, command, preflight, native, previewArtifact, previewGroup: args.previewGroup, sourceRecord: source.recordPath };
  }

  const latest = (dependencies.runPreflight || runPreflight)({ repoRoot, archive: true, platform, baseline });
  if (latest.head !== preflight.head || latest.deployedCommit !== preflight.deployedCommit) fail('Production or source changed during verification.');
  const productionGroup = parseRepublishedGroupId(runEas(command));
  const published = JSON.parse(runEas(['update:view', productionGroup, '--json']));
  const metadata = { ...extractReleaseMetadata(published, { head: preflight.head }), platform, previousGroupId: preflight.groupId };
  const productionArtifact = await verifyArtifact(published, metadata.groupId, undefined, platform);
  if (productionArtifact.sha256 !== previewArtifact.sha256) {
    fail('Production republish changed the verified preview launch bundle.');
  }
  appendReleaseRecord(
    path.join(repoRoot, 'README.md'),
    metadata,
    args.message,
    productionArtifact
  );
  return {
    apply: true,
    sourceRecord: source.recordPath,
    command,
    metadata,
    preflight,
    native,
    previewArtifact,
    productionArtifact,
    previewGroup: args.previewGroup,
  };
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const result = await runRelease({ repoRoot: path.resolve(__dirname, '..'), args });
    if (result.apply) {
      process.stdout.write(`Published production group ${result.metadata.groupId} and recorded it in README.md.\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\nDRY RUN ONLY: no EAS update was published.\n`);
    }
  })().catch((error) => {
    process.stderr.write(`EAS production update failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  appendReleaseRecord,
  buildRepublishCommand,
  extractReleaseMetadata,
  formatReleaseRecord,
  normalizeUpdates,
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
};
