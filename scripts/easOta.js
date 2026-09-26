'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { platforms, preparationKey, storeDestination, deploymentDigest } = require('./easReleasePlan');
const { readBaseline, parseEasJson, validateBuild, validateFingerprint, previewNativeMetadata } = require('./easNativeCompatibility');
const { prepareSource, createEasRunner, verifySource } = require('./easReleaseSource');
const { currentProductionCommit, validateRepositoryState, validateDeployedCommit } = require('./easProductionPreflight');
const { validateEasIdentity, validateMessage, validateReleaseConfiguration, validatePreviewUpdates,
  formatReleaseRecord } = require('./easProductionUpdate');
const { verifyProductionUpdateArtifact, verifyPublicUpdate } = require('./easUpdateArtifact');
const { validateTargets } = require('./releaseReadiness');

const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function environmentDigest(read, env = process.env) {
  // Long output includes variable IDs and update timestamps even when values
  // are masked. Keep only its digest: never persist credentials or values.
  const remote = ['project', 'account'].map(scope => read(['env:list', 'production', '--scope', scope, '--format', 'long'])
    .replace(/\u001b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n').trim());
  const local = Object.keys(env).filter(key => /^(EXPO_|EAS_|PLANLI_|GOOGLE_|NODE_)/.test(key))
    .sort().map(key => [key, env[key]]);
  return sha({ remote, local });
}
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const normalize = value => (Array.isArray(value) ? value : value.updates || []).map(update => ({ ...update,
  branch: update.branch?.name || update.branch, runtimeVersion: update.runtime?.version || update.runtimeVersion }));

function acquireReleaseLock(lockPath) {
  try { return fs.openSync(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`OTA lock already exists: ${lockPath}. Do not start another release. If its process crashed, verify the recorded owner has ended and clear that exact lock before resuming.`);
  }
}

function parseArgs(argv) {
  const args = { platform: 'all', apply: false, message: '', resume: '' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--apply') args.apply = true;
    else if (['--platform', '--message', '--resume'].includes(flag)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
      args[flag.slice(2)] = value;
    } else throw new Error(`Unknown OTA argument: ${flag}`);
  }
  platforms(args.platform);
  if (args.apply) validateMessage(args.message);
  return args;
}

function assertUpdates(updates, targets, head, branch) {
  if (updates.length !== targets.length) throw new Error('Publication did not return exactly the requested platforms.');
  for (const target of targets) {
    const selected = updates.filter(update => update.platform === target.platform);
    if (selected.length !== 1) throw new Error(`Missing or duplicate ${target.platform} update.`);
    const [update] = selected;
    if (update.gitCommitHash !== head || update.runtimeVersion !== target.baseline.runtime
      || update.branch !== branch || update.isRollBackToEmbedded || !update.id || !update.group) {
      throw new Error(`Invalid ${target.platform} publication identity.`);
    }
  }
}

// Persist before/after every external mutation. An ambiguous response is resolved
// by its unique operation message; it never causes a blind second publication.
async function mutation(state, key, save, services, operation) {
  if (state.operations[key]?.updates) return state.operations[key].updates;
  const existing = state.operations[key];
  const message = `${state.message.slice(0, 100)} [ota:${state.id}:${key}]`;
  if (existing) {
    const recovered = await services.recover({ ...operation, message });
    if (!recovered.length) throw new Error(`Publication ${key} is uncertain; no duplicate was sent. Resume after provider state is available.`);
    existing.updates = recovered;
    save();
    return recovered;
  }
  state.operations[key] = { message, startedAt: new Date().toISOString() };
  save();
  const updates = await services.publish({ ...operation, message });
  state.operations[key].updates = updates;
  save();
  return updates;
}

async function executeOta({ context, state, save, services }) {
  const targets = context.targets.filter(target => !target.current);
  if (!targets.length) return state;
  // Validation receipts decide reuse from inputs, never from an unchecked flag
  // in the release journal. All requested native checks precede any upload.
  await services.validate(targets);
  const prepared = new Map();
  for (const target of targets) {
    const key = preparationKey(target.baseline);
    if (!prepared.has(key)) {
      const source = await services.prepare(target, state.sources[key]);
      state.sources[key] = source.recordPath;
      prepared.set(key, { source, targets: [] });
      save();
    }
    prepared.get(key).targets.push(target);
  }
  for (const { source, targets: group } of prepared.values()) {
    for (const target of group) {
      const proof = await services.native(target, source, state.native[target.platform]);
      state.native[target.platform] = proof;
      save();
    }
  }
  let groupIndex = 0;
  const candidates = [];
  for (const { source, targets: group } of prepared.values()) {
    const key = `candidate-${groupIndex++}`;
    if (state.operations[key] && !state.operations[key].updates) {
      await mutation(state, key, save, services, { kind: 'candidate', targets: group, source });
    }
    await services.fresh(group, state);
    const updates = await mutation(state, key, save, services,
      { kind: 'candidate', targets: group, source });
    assertUpdates(updates, group, context.head, 'staging');
    for (const target of group) {
      const update = updates.find(item => item.platform === target.platform);
      const artifact = await services.candidate(target, source, update, state.artifacts[update.id], state.native[target.platform]);
      state.artifacts[update.id] = artifact;
      save();
      candidates.push({ target, source, update, artifact });
    }
  }
  // Barrier: a bad Android candidate must not silently turn an all-platform
  // release into an iOS-only success (or vice versa).
  const promotions = new Map();
  for (const candidate of candidates) {
    const key = candidate.update.group;
    if (!promotions.has(key)) promotions.set(key, []);
    promotions.get(key).push(candidate);
  }
  for (const [candidateGroup, group] of promotions) {
    const targets = group.map(item => item.target);
    const key = `production-${candidateGroup}`;
    if (state.operations[key] && !state.operations[key].updates) {
      await mutation(state, key, save, services, { kind: 'production', targets,
        source: group[0].source, candidateGroup });
    }
    await services.fresh(targets, state);
    const updates = await mutation(state, key, save, services,
      { kind: 'production', targets, source: group[0].source, candidateGroup });
    assertUpdates(updates, targets, context.head, 'production');
    for (const candidate of group) {
      const update = updates.find(item => item.platform === candidate.target.platform);
      const delivery = await services.delivery(candidate.target, update, candidate.artifact);
      state.published[candidate.target.platform] = { update, artifact: candidate.artifact, delivery,
        previousGroupId: candidate.target.lineage.groupId };
      save();
    }
  }
  state.status = 'complete';
  save();
  return state;
}

function createReadRunner(root, metrics) {
  const globalModules = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'],
    { encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true }).trim();
  const entry = path.join(globalModules, 'eas-cli/bin/run');
  if (JSON.parse(fs.readFileSync(path.join(globalModules, 'eas-cli/package.json'))).version !== '22.6.0') {
    throw new Error('Install the repository-pinned EAS CLI 22.6.0.');
  }
  return args => {
    if (!['whoami', 'build:view', 'channel:view', 'update:list', 'update:view', 'env:list'].includes(args[0])) throw new Error('Read runner cannot publish.');
    const started = Date.now();
    try {
      return execFileSync(process.execPath, [entry, ...args], { cwd: path.join(root, 'client'), encoding: 'utf8',
        windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CI: '1', EAS_NO_VCS: '1', EXPO_NO_DOTENV: '1', PLANLI_ENV: 'production',
          EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'planli-f0b12' } });
    } finally { metrics.push({ command: args[0], durationMs: Date.now() - started }); }
  };
}

function repositoryState(root) {
  return { branch: git(root, ['branch', '--show-current']), head: git(root, ['rev-parse', 'HEAD']),
    originMain: git(root, ['rev-parse', 'origin/main']),
    status: git(root, ['status', '--porcelain=v1', '--untracked-files=no']) };
}

function assertProductionChannel(channel) {
  channel = channel.currentPage || channel;
  const branches = channel.updateBranches || [];
  const mapping = channel.branchMapping && JSON.parse(channel.branchMapping);
  if (channel.isPaused || channel.name !== 'production' || branches.length !== 1 || branches[0].name !== 'production'
    || (mapping && (mapping.version !== 0 || mapping.data?.length !== 1
      || mapping.data[0].branchId !== branches[0].id || mapping.data[0].branchMappingLogic !== 'true'))) {
    throw new Error('Production channel must point only to the production branch.');
  }
}

async function main(args, root = path.resolve(__dirname, '..')) {
  const metrics = [];
  const read = createReadRunner(root, metrics);
  validateEasIdentity(read(['whoami']));
  git(root, ['fetch', '--quiet', 'origin', 'main']);
  const repo = repositoryState(root);
  if (args.apply) validateRepositoryState(repo);
  if (git(root, ['ls-files', '--', 'app.json', 'eas.json'])) throw new Error('Tracked Expo configuration must live under client/.');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'client/app.json'))).expo;
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'client/eas.json')));
  const track = storeDestination(eas);
  assertProductionChannel(parseEasJson(read(['channel:view', 'production', '--json'])));
  const requested = platforms(args.platform);
  const targets = requested.map(platform => {
    const baseline = readBaseline(root, platform);
    validateReleaseConfiguration({ app, eas }, platform, baseline);
    const build = parseEasJson(read(['build:view', baseline.buildId, '--json']));
    validateBuild(build, baseline);
    const lineage = currentProductionCommit(path.join(root, 'client'), platform, baseline, read);
    validateDeployedCommit({ deployedCommit: lineage.deployedCommit, head: repo.head,
      isAncestor: (() => { try { git(root, ['merge-base', '--is-ancestor', lineage.deployedCommit, repo.head]); return true; } catch { return false; } })() });
    const current = !lineage.groupId.startsWith('embedded-build:')
      && deploymentDigest(root, lineage.deployedCommit) === deploymentDigest(root, repo.head);
    return { platform, baseline, lineage, deployedCommit: lineage.deployedCommit, current };
  });
  console.log(JSON.stringify({ apply: args.apply, source: repo.head, storeTrack: track,
    targets: targets.map(({ platform, baseline, current }) => ({ platform, build: baseline.buildNumber,
      version: baseline.iosVersion || baseline.appVersion, runtime: baseline.runtime, channel: baseline.channel,
      action: current ? 'already-current' : 'publish-ota' })) }, null, 2));
  if (!args.apply || (!args.resume && targets.every(target => target.current))) return;

  const directory = path.join(root, '.codex_tmp/releases');
  fs.mkdirSync(directory, { recursive: true });
  const environment = environmentDigest(read);
  const binding = sha({ head: repo.head, requested, baselines: targets.map(target => target.baseline),
    node: process.version, environment, cli: '22.6.0',
    lock: fs.readFileSync(path.join(root, 'client/package-lock.json'), 'utf8') });
  const statePath = args.resume ? path.resolve(root, args.resume) : path.join(directory, `ota-${crypto.randomUUID()}.json`);
  if (path.dirname(statePath) !== directory || !/^ota-[\da-f-]+\.json$/.test(path.basename(statePath))) throw new Error('Resume journal must be in this repository release directory.');
  let state = args.resume ? JSON.parse(fs.readFileSync(statePath)) : { version: 1, id: crypto.randomUUID(), binding,
    head: repo.head, message: args.message, targets, status: 'running', sources: {}, native: {}, artifacts: {}, operations: {}, published: {} };
  if (state.version !== 1 || state.binding !== binding || state.message !== args.message) throw new Error('Release journal inputs changed; do not reuse it.');
  const save = () => { fs.writeFileSync(statePath + '.tmp', JSON.stringify(state, null, 2)); fs.renameSync(statePath + '.tmp', statePath); };
  const lockPath = path.join(directory, 'ota.lock');
  const lock = acquireReleaseLock(lockPath);
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, statePath }));
  console.log(`Release journal: ${statePath}`);
  save();
  const runners = new Map();
  const immutableReads = new Map();
  const immutableRead = args => {
    const key = JSON.stringify(args);
    if (!immutableReads.has(key)) immutableReads.set(key, parseEasJson(read(args)));
    return immutableReads.get(key);
  };
  let stagingMetadata;
  const runner = source => {
    if (!runners.has(source.recordPath)) runners.set(source.recordPath, createEasRunner(source));
    return runners.get(source.recordPath);
  };
  const readGroups = updates => [...new Set(updates.map(update => update.group))].flatMap(group =>
    normalize(parseEasJson(read(['update:view', group, '--json']))));
  const services = {
    validate: active => validateTargets(root, active),
    prepare: (target, sourceRecord) => prepareSource({ repoRoot: root, baseline: target.baseline, sourceRecord }),
    native(target, source, previous) {
      const proofBinding = sha({ commit: source.commit, baseline: target.baseline, locks: source.dependencyLockDigest, environment });
      if (previous?.binding === proofBinding) {
        verifySource(source);
        validateFingerprint({ hash: previous.fingerprint, baseline: target.baseline, sourceRoot: source.sourceRoot });
        return previous;
      }
      const generated = parseEasJson(runner(source)(['fingerprint:generate', '--platform', target.platform,
        '--environment', 'production', '--json', '--non-interactive']));
      fs.writeFileSync(source.sourceRoot + `-${target.platform}-fingerprint.json`, JSON.stringify(generated));
      const proof = validateFingerprint({ hash: generated.hash, baseline: target.baseline, sourceRoot: source.sourceRoot });
      return { ...proof, binding: proofBinding };
    },
    fresh(active, journal) {
      git(root, ['fetch', '--quiet', 'origin', 'main']);
      const latest = repositoryState(root);
      validateRepositoryState(latest);
      if (latest.head !== repo.head) throw new Error('Source changed during release.');
      if (environmentDigest(read) !== environment) throw new Error('Production environment changed during release.');
      assertProductionChannel(parseEasJson(read(['channel:view', 'production', '--json'])));
      for (const target of active) {
        const current = currentProductionCommit(path.join(root, 'client'), target.platform, target.baseline, read);
        const completed = journal.published[target.platform];
        const pending = Object.values(journal.operations).flatMap(operation => operation.updates || [])
          .find(update => update.platform === target.platform && update.branch === 'production');
        const accepted = [target.lineage.groupId, completed?.update.group, pending?.group].filter(Boolean);
        if (!accepted.includes(current.groupId)) throw new Error(`Production changed for ${target.platform}; publication stopped.`);
      }
    },
    publish({ kind, source, targets: active, candidateGroup, message }) {
      const platform = active.length === 2 ? 'all' : active[0].platform;
      const command = kind === 'candidate'
        ? ['update', '--branch', 'staging', '--platform', platform, '--environment', 'production', '--emit-metadata']
        : ['update:republish', '--group', candidateGroup, '--destination-channel', 'production', '--platform', platform];
      const result = normalize(parseEasJson(runner(source)([...command, '--message', message, '--non-interactive', '--json'])));
      if (kind === 'candidate') stagingMetadata = undefined;
      return result;
    },
    recover({ kind, message, targets: active }) {
      const groups = new Set();
      for (const target of active) {
        const inventory = parseEasJson(read(['update:list', '--branch', kind === 'candidate' ? 'staging' : 'production',
          '--platform', target.platform, '--runtime-version', target.baseline.runtime, '--limit', '50', '--json', '--non-interactive']));
        for (const item of inventory.currentPage || []) if (item.message === message) groups.add(item.group);
      }
      const updates = readGroups([...groups].map(group => ({ group })));
      if (updates.some(update => update.message !== message)) throw new Error('Recovered publication has an ambiguous identity.');
      return updates;
    },
    async candidate(target, source, update, previous, native) {
      validatePreviewUpdates({ value: [update], groupId: update.group, head: repo.head,
        platform: target.platform, runtime: target.baseline.runtime });
      const detail = normalize(immutableRead(['update:view', update.group, '--json'])).find(item => item.id === update.id);
      if (!detail || detail.gitCommitHash !== repo.head) throw new Error('Candidate update changed.');
      stagingMetadata ||= parseEasJson(read(['channel:view', 'staging', '--json']));
      const metadata = previewNativeMetadata(stagingMetadata, update.id);
      if (metadata.group !== update.group || metadata.fingerprint.hash !== native.fingerprint) throw new Error('Published native fingerprint differs from preflight.');
      validateFingerprint({ hash: metadata.fingerprint.hash, baseline: target.baseline, sourceRoot: source.sourceRoot });
      const artifactBinding = sha({ update, native: native.fingerprint, head: repo.head });
      if (previous?.binding === artifactBinding && /^[A-F0-9]{64}$/.test(previous.sha256)) return previous;
      return { ...await verifyProductionUpdateArtifact([update], update.group, undefined, target.platform, target.baseline.runtime), binding: artifactBinding };
    },
    delivery: (target, update, artifact) => verifyPublicUpdate({ projectId: target.baseline.projectId,
      platform: target.platform, runtime: target.baseline.runtime, update, artifact }),
  };
  for (const [stage, action] of Object.entries(services)) {
    services[stage] = async (...inputs) => {
      const started = Date.now();
      try { return await action(...inputs); }
      finally { metrics.push({ stage, durationMs: Date.now() - started,
        ...(stage === 'publish' ? { kind: inputs[0].kind, exports: inputs[0].kind === 'candidate' ? 1 : 0 } : {}) }); }
    };
  }
  try {
    await executeOta({ context: { head: repo.head, targets: state.targets }, state, save, services });
    const readme = path.join(root, 'README.md');
    for (const [platform, published] of Object.entries(state.published)) {
      if (!fs.readFileSync(readme, 'utf8').includes(published.update.id)) {
        fs.appendFileSync(readme, formatReleaseRecord({ platform, commit: repo.head, groupId: published.update.group,
          runtime: published.update.runtimeVersion, channel: 'production', environment: 'production',
          createdAt: published.update.createdAt, previousGroupId: published.previousGroupId }, args.message,
        { ...published.artifact, updateId: published.update.id }));
      }
    }
    console.log(JSON.stringify({ status: state.status, journal: statePath, published: state.published,
      unchanged: targets.filter(target => target.current).map(target => target.platform), metrics }, null, 2));
  } catch (error) {
    state.status = 'needs-attention';
    state.error = error.message;
    save();
    throw error;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
    fs.writeFileSync(statePath.replace('.json', '-metrics.json'), JSON.stringify(metrics, null, 2));
  }
}

if (require.main === module) main(parseArgs(process.argv.slice(2)))
  .catch(error => { console.error(`OTA stopped: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, assertUpdates, executeOta, mutation, assertProductionChannel, environmentDigest, acquireReleaseLock, main };
