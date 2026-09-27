#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { gcloudAccessToken } = require('../functions/scripts/localCredentials');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = 'planli-f0b12';
const REGION = 'europe-west1';
const CONFIRM = 'APPLY PLANLI STAGE THREE APP CHECK';
const ENV_FILE = path.join(ROOT, 'functions', `.env.${PROJECT}`);
const CANARY = ['issueGuestSession', 'getReactionState', 'setFavorite', 'listAdminSavedViews'];
const PUBLIC = ['getPersonalizedRecommendations', 'getMapRecommendations', 'getPersonalizedRoutes',
  'loadRouteDetails', 'getDestinationOverview', 'searchDestinations', 'getSharedTrip'];
const DELETION = ['deleteContent', 'requestAccountDeletion'];
const SERVICES = ['firestore.googleapis.com', 'firebasestorage.googleapis.com', 'identitytoolkit.googleapis.com'];
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const hash = (value) => sha(JSON.stringify(stable(value)));

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: ROOT, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(`${executable} failed (${result.status ?? result.error?.code}). Inspect the bounded command log.`);
  return (result.stdout || '').trimEnd();
}
function sourceIdentity() {
  const revision = command('git', ['rev-parse', 'HEAD']);
  const branch = command('git', ['branch', '--show-current']);
  if (!branch || branch === 'main') throw new Error('Use a dedicated topic branch.');
  const dirty = command('git', ['status', '--porcelain', '--untracked-files=all']).split('\n')
    .filter(Boolean).filter((line) => line.slice(3) !== 'README.md');
  if (dirty.length) throw new Error('Commit the reviewed rollout source before snapshot/apply; only README status updates may remain dirty.');
  const files = command('git', ['ls-files', 'functions', 'scripts/securityAppCheckRollout.js',
    'scripts/securityMonitoringPlan.js', 'config/security-monitoring.json', 'firebase.json', '.firebaserc']).split('\n').filter(Boolean).sort();
  return { revision, branch, sha256: hash(files.map((file) => [file, sha(fs.readFileSync(path.join(ROOT, file)))])) };
}
function assertSourceCompatible(expected, actual, changedPaths) {
  if (hash(expected) === hash(actual)) return;
  const operationsOnly = new Set(['README.md', 'docs/security-app-check-rollout.md',
    'scripts/securityAppCheckRollout.js', 'scripts/securityAppCheckRollout.test.js',
    'scripts/securityAppCheckRolloutExecution.test.js', 'scripts/securityMonitoringPlan.js',
    'scripts/securityMonitoringPlan.test.js']);
  if (actual.branch !== expected.branch || expected.revision === actual.revision
    || !changedPaths.length || changedPaths.some((file) => !operationsOnly.has(file))) {
    throw new Error('Rollout deployment source changed; do not mix source versions.');
  }
  // These root-level operator files are not uploaded from functions/. Keep the
  // immutable deployment source marker and record the new operator commit.
}
function batchesFor(source) {
  const targets = [...source.matchAll(/exports\.(\w+)\s*=\s*callable\(/g)].map((match) => match[1]);
  if (new Set(targets).size !== targets.length || targets.length !== 103) throw new Error('Callable inventory changed; review the rollout manifest definition.');
  for (const name of [...CANARY, ...PUBLIC, ...DELETION]) if (!targets.includes(name)) throw new Error(`Missing callable ${name}.`);
  const rest = targets.filter((name) => ![...CANARY, ...PUBLIC, ...DELETION].includes(name)).sort();
  const batches = [{ id: 'canary', kind: 'functions', targets: CANARY }, { id: 'public', kind: 'functions', targets: PUBLIC }];
  for (let i = 0; i < rest.length; i += 10) batches.push({ id: `remaining-${1 + i / 10}`, kind: 'functions', targets: rest.slice(i, i + 10) });
  batches.push({ id: 'deletion', kind: 'functions', targets: DELETION });
  SERVICES.forEach((service, index) => batches.push({ id: ['firestore', 'storage', 'authentication'][index], kind: 'service', targets: [service] }));
  return batches;
}
function setEnforcementEnv(text, value, sourceHash) {
  const line = `PLANLI_ENFORCE_APP_CHECK=${value ? 'true' : 'false'}`;
  const matches = text.match(/^PLANLI_ENFORCE_APP_CHECK=.*$/gm) || [];
  if (matches.length > 1) throw new Error('Duplicate App Check environment values.');
  let result = matches.length ? text.replace(/^PLANLI_ENFORCE_APP_CHECK=.*$/m, line) : `${text.trimEnd()}\n${line}\n`;
  if (sourceHash) {
    if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid source marker.');
    if ((result.match(/^PLANLI_APP_CHECK_ROLLOUT_SOURCE=.*$/gm) || []).length > 1) throw new Error('Duplicate source marker.');
    const marker = `PLANLI_APP_CHECK_ROLLOUT_SOURCE=${sourceHash}`;
    result = /^PLANLI_APP_CHECK_ROLLOUT_SOURCE=/m.test(result)
      ? result.replace(/^PLANLI_APP_CHECK_ROLLOUT_SOURCE=.*$/m, marker) : `${result.trimEnd()}\n${marker}\n`;
  }
  return result;
}
async function api(url, token, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`,
    'x-goog-user-project': PROJECT, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Control-plane HTTP ${response.status} (${new URL(url).hostname}).`);
  return response.status === 204 ? {} : response.json();
}
async function inventory(token) {
  const [functions, services] = await Promise.all([
    api(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions?pageSize=1000`, token),
    api('https://firebaseappcheck.googleapis.com/v1beta/projects/633543026638/services', token),
  ]);
  if (functions.nextPageToken || services.nextPageToken) throw new Error('Incomplete inventory; refuse rollout.');
  return { functions: functions.functions || [], services: services.services || [] };
}
function safeInventory(state) {
  return {
    functions: state.functions.map((fn) => ({ name: fn.name.split('/').pop(), state: fn.state,
      revision: fn.serviceConfig?.revision, configuredRevision: fn.serviceConfig?.revision, service: fn.serviceConfig?.service,
      enforced: fn.serviceConfig?.environmentVariables?.PLANLI_ENFORCE_APP_CHECK === 'true',
      sourceMarker: fn.serviceConfig?.environmentVariables?.PLANLI_APP_CHECK_ROLLOUT_SOURCE || null,
      deploymentHash: fn.labels?.['firebase-functions-hash'] || null,
      callable: fn.labels?.['deployment-callable'] === 'true', updateTime: fn.updateTime })),
    services: state.services.map((service) => ({ name: service.name, enforcementMode: service.enforcementMode, etag: service.etag })),
  };
}
function assertInventory(batches, state) {
  for (const name of batches.filter((batch) => batch.kind === 'functions').flatMap((batch) => batch.targets)) {
    const fn = state.functions.find((entry) => entry.name === name);
    if (!fn || !fn.callable || fn.state !== 'ACTIVE' || !fn.revision || !fn.service) throw new Error(`Missing/unstable callable ${name}.`);
    const serviceId = name.toLowerCase();
    if (![PROJECT, '633543026638'].some((project) => fn.service === `projects/${project}/locations/${REGION}/services/${serviceId}`)
      || !fn.revision.startsWith(`${serviceId}-`) || !/^[a-z0-9-]+$/.test(fn.revision)) throw new Error(`Unexpected runtime identity ${name}.`);
  }
  for (const id of SERVICES) if (!state.services.some((service) => service.name.endsWith('/' + id))) throw new Error(`Missing service ${id}.`);
}
function batchState(batch, state) {
  return batch.kind === 'functions'
    ? batch.targets.map((name) => state.functions.find((fn) => fn.name === name))
    : batch.targets.map((name) => state.services.find((service) => service.name.endsWith('/' + name)));
}
function verifyEnabled(batch, state, sourceHash) {
  const values = batchState(batch, state);
  return values.length === batch.targets.length && values.every((value) => value && (batch.kind === 'functions'
    ? value.state === 'ACTIVE' && value.enforced && (!sourceHash || value.sourceMarker === sourceHash)
    : value.enforcementMode === 'ENFORCED'));
}
function trafficServesRevision(service, revision) {
  if (service.reconciling || service.terminalCondition?.state !== 'CONDITION_SUCCEEDED') return false;
  const targets = (service.trafficStatuses || []).filter((target) => Number(target.percent) > 0);
  return targets.length === 1 && Number(targets[0].percent) === 100
    && targets[0].revision?.split('/').pop() === revision;
}
async function assertServing(batch, state, token) {
  if (batch.kind !== 'functions') return;
  const functions = batchState(batch, state);
  for (let offset = 0; offset < functions.length; offset += 5) {
    await Promise.all(functions.slice(offset, offset + 5).map(async (fn) => {
      const service = await api(`https://run.googleapis.com/v2/${fn.service}`, token);
      if (!trafficServesRevision(service, fn.revision)) throw new Error(`Traffic is not fully serving the expected revision of ${fn.name}.`);
    }));
  }
}
async function resolveServing(state, token, targets) {
  const functions = state.functions.filter((fn) => targets.includes(fn.name));
  for (let offset = 0; offset < functions.length; offset += 5) {
    await Promise.all(functions.slice(offset, offset + 5).map(async (fn) => {
      const service = await api(`https://run.googleapis.com/v2/${fn.service}`, token);
      const revision = service.trafficStatuses?.find((target) => Number(target.percent) === 100)?.revision?.split('/').pop();
      if (!revision || !trafficServesRevision(service, revision)) throw new Error(`Unstable serving revision of ${fn.name}.`);
      // Functions metadata can still name the newer revision after traffic rollback.
      if (revision !== fn.configuredRevision) {
        const runtime = await api(`https://run.googleapis.com/v2/${fn.service}/revisions/${revision}`, token);
        const env = runtime.containers?.[0]?.env || [];
        fn.enforced = env.find((item) => item.name === 'PLANLI_ENFORCE_APP_CHECK')?.value === 'true';
        fn.sourceMarker = env.find((item) => item.name === 'PLANLI_APP_CHECK_ROLLOUT_SOURCE')?.value || null;
      }
      fn.revision = revision;
    }));
  }
  return state;
}
async function restoreTraffic(previous, token, dryRun = false) {
  // The v2 PATCH endpoint rejects traffic-only changes on some managed Functions
  // revisions (409). v1 preserves the exact template and guards resourceVersion.
  const url = `https://${REGION}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${PROJECT}/services/${previous.name.toLowerCase()}`;
  const service = await api(url, token);
  if (!service.metadata?.resourceVersion || !service.spec?.template) throw new Error('Missing rollback concurrency/template evidence.');
  return api(`${url}${dryRun ? '?dryRun=all' : ''}`, token, 'PUT', {
    ...service, spec: { ...service.spec, traffic: [{ revisionName: previous.revision, percent: 100 }] },
  });
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, file);
}
function validateManifest(manifest) {
  const { manifestSha256, ...body } = manifest;
  if (manifest.schemaVersion !== 1 || manifest.project !== PROJECT || manifest.region !== REGION || hash(body) !== manifestSha256) throw new Error('Invalid or edited rollout manifest.');
  const expected = batchesFor(fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8'));
  if (hash(expected) !== hash(manifest.batches)) throw new Error('Unexpected rollout targets.');
  assertInventory(manifest.batches, manifest.baseline);
}
function assertEvidence(batch, evidence, entry, now = Date.now()) {
  if (!entry || entry.status !== 'applied') throw new Error('Read-back must pass before accepting smoke evidence.');
  if (evidence.batch !== batch.id || evidence.manifestSha256 !== entry.manifestSha256
    || evidence.postStateSha256 !== hash(entry.postState)) throw new Error('Evidence is not bound to this deployed batch.');
  const checks = ['positive', 'negative', 'logsReviewed'];
  if (batch.id === 'canary') checks.push('ios', 'android', 'web', 'guest', 'emailReceived');
  if (batch.kind === 'service') checks.push('ios', 'android', 'web');
  if (batch.id === 'storage') checks.push('uploadBeforeEnforcement', 'backgroundUpload', 'processedImageDisplayed');
  if (batch.id === 'authentication') checks.push('emailSignIn', 'googleSignIn', 'appleSignIn', 'totp', 'passwordReset');
  if (batch.id === 'deletion') checks.push('freshToken', 'replayRejected', 'disposableFixturesOnly');
  if (checks.some((key) => evidence.checks?.[key] !== true)) throw new Error(`Required smoke evidence: ${checks.join(', ')}.`);
  if (!Array.isArray(evidence.receipts) || !evidence.receipts.length || evidence.receipts.some((receipt) => typeof receipt !== 'string' || !receipt.trim())) throw new Error('Evidence must identify actual receipts.');
  const minimum = batch.id === 'canary' || batch.kind === 'service' ? 15 * 60000 : 0;
  if (!Number.isFinite(Date.parse(entry.appliedAt)) || now - Date.parse(entry.appliedAt) < minimum) throw new Error('The propagation/observation window has not elapsed.');
}
function requirePrevious(manifest, journal, batch) {
  const index = manifest.batches.findIndex((item) => item.id === batch.id);
  for (const previous of manifest.batches.slice(0, index)) {
    if (journal.batches[previous.id]?.status !== 'accepted') throw new Error(`Prior batch ${previous.id} lacks accepted runtime evidence.`);
  }
}
function parseArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (['--apply', '--verify', '--rollback', '--accept'].includes(key)) options[key.slice(2)] = true;
    else if (['--snapshot', '--manifest', '--batch', '--confirm', '--evidence'].includes(key)) {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing ${key} value.`);
      options[key.slice(2)] = argv[++index];
    } else throw new Error(`Unknown argument ${key}.`);
  }
  if ([options.verify, options.rollback, options.accept].filter(Boolean).length > 1) throw new Error('Select one rollout operation.');
  if (options.apply && options.confirm !== CONFIRM) throw new Error('Apply requires the exact rollout confirmation.');
  return options;
}
async function execute(options) {
  if (options.apply && options.confirm !== CONFIRM) throw new Error('Apply requires the exact rollout confirmation.');
  const source = sourceIdentity();
  const token = gcloudAccessToken().access_token;
  const live = safeInventory(await inventory(token));
  if (options.snapshot) {
    if (options.apply || options.manifest) throw new Error('Snapshot is a separate read-only operation.');
    const batches = batchesFor(fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8'));
    assertInventory(batches, live);
    await resolveServing(live, token, batches.filter((batch) => batch.kind === 'functions').flatMap((batch) => batch.targets));
    const body = { schemaVersion: 1, project: PROJECT, region: REGION, createdAt: new Date().toISOString(), source, batches, baseline: live };
    const manifest = { ...body, manifestSha256: hash(body) };
    const file = path.resolve(options.snapshot);
    if (fs.existsSync(file)) throw new Error('Snapshot exists; do not replace a rollout baseline.');
    writeJson(file, manifest);
    return { mode: 'snapshot', file, manifestSha256: manifest.manifestSha256, source, batches: batches.map(({ id, targets }) => ({ id, count: targets.length })) };
  }
  if (!options.manifest) throw new Error('Supply --snapshot or --manifest.');
  const file = path.resolve(options.manifest);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateManifest(manifest);
  const changedPaths = hash(source) === hash(manifest.source) ? []
    : command('git', ['diff', '--name-only', manifest.source.revision, source.revision]).split('\n').filter(Boolean);
  assertSourceCompatible(manifest.source, source, changedPaths);
  const batch = manifest.batches.find((entry) => entry.id === options.batch);
  if (!batch) throw new Error('Choose an exact manifest --batch.');
  const journalFile = `${file}.journal.json`;
  const journal = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile, 'utf8'))
    : { manifestSha256: manifest.manifestSha256, batches: {} };
  if (journal.manifestSha256 !== manifest.manifestSha256) throw new Error('Journal belongs to a different rollout.');
  const entry = journal.batches[batch.id];
  if (!options.rollback && !['rolling-back', 'rollback-pending-verification'].includes(entry?.status)) {
    await resolveServing(live, token, manifest.batches.slice(0, manifest.batches.indexOf(batch) + 1)
      .filter((item) => item.kind === 'functions').flatMap((item) => item.targets));
  }
  if (!options.apply && !options.verify) return { mode: 'dry-run', batch, operation: options.rollback ? 'rollback' : options.accept ? 'accept' : 'enforce', current: batchState(batch, live), priorStatus: entry?.status || 'not-started' };
  const lock = `${journalFile}.lock`;
  const descriptor = fs.openSync(lock, 'wx');
  fs.closeSync(descriptor);
  try {
    journal.operatorRevision = source.revision;
    if (options.accept) {
      requirePrevious(manifest, journal, batch);
      for (const previous of manifest.batches.slice(0, manifest.batches.indexOf(batch))) {
        if (hash(batchState(previous, live)) !== hash(journal.batches[previous.id].postState)) throw new Error(`Previously accepted batch changed: ${previous.id}.`);
        await assertServing(previous, live, token);
      }
      const evidence = JSON.parse(fs.readFileSync(path.resolve(options.evidence || ''), 'utf8'));
      assertEvidence(batch, evidence, entry);
      if (hash(batchState(batch, live)) !== hash(entry.postState)) throw new Error('Deployment changed after the smoke evidence.');
      await assertServing(batch, live, token);
      entry.status = 'accepted'; entry.evidence = evidence; entry.acceptedAt = new Date().toISOString();
      writeJson(journalFile, journal);
      return { mode: 'accepted', batch: batch.id };
    }
    if (options.verify) {
      if (entry && ['rolling-back', 'rollback-pending-verification'].includes(entry.status)) {
        if (batch.kind === 'functions') {
          for (const previous of entry.before) {
            const service = await api(`https://run.googleapis.com/v2/${previous.service}`, token);
            if (!trafficServesRevision(service, previous.revision)) throw new Error('Rollback traffic is not yet verified; do not repeat mutations.');
          }
        } else if (entry.before.some((previous) => live.services.find((service) => service.name === previous.name)?.enforcementMode !== previous.enforcementMode)) {
          throw new Error('Rollback service state is not yet verified.');
        }
        entry.status = 'rolled-back'; entry.rollbackVerifiedAt = new Date().toISOString();
        writeJson(journalFile, journal);
        return { mode: 'rolled-back', batch: batch.id, next: 'Verify client recovery and start a newly reviewed rollout after the cause is fixed.' };
      }
      if (!entry || !['deploying', 'applied'].includes(entry.status)) throw new Error('No pending apply to verify.');
      if (!verifyEnabled(batch, live, manifest.source.sha256)) throw new Error('Target state/source is not fully verified; do not repeat an uncertain deployment.');
      await assertServing(batch, live, token);
      entry.status = 'applied'; entry.appliedAt ||= new Date().toISOString(); entry.postState = batchState(batch, live);
      writeJson(journalFile, journal);
      return { mode: 'verified', batch: batch.id, postStateSha256: hash(entry.postState), appliedAt: entry.appliedAt };
    }
    if (options.rollback) {
      if (!entry || !['deploying', 'applied', 'accepted', 'rolling-back', 'rollback-pending-verification'].includes(entry.status)) throw new Error('No applied batch to roll back.');
      // Restore the exact previous Cloud Run revision, including code and env.
      // Keep evidence and the new revision for diagnosis; never delete revisions.
      entry.status = 'rolling-back'; entry.rollbackTargets ||= {}; writeJson(journalFile, journal);
      if (batch.kind === 'functions') {
        for (const previous of entry.before) {
          const url = `https://run.googleapis.com/v2/${previous.service}`;
          const service = await api(url, token);
          if (trafficServesRevision(service, previous.revision)) {
            entry.rollbackTargets[previous.name] = { status: 'verified' };
            writeJson(journalFile, journal); continue;
          }
          if (service.reconciling) throw new Error(`Rollback still reconciling ${previous.name}; inspect/read back before retry.`);
          entry.rollbackTargets[previous.name] = { status: 'requesting', observedEtag: service.etag };
          writeJson(journalFile, journal);
          const restored = await restoreTraffic(previous, token);
          entry.rollbackTargets[previous.name] = { status: 'requested', resourceVersion: restored.metadata?.resourceVersion || null };
          writeJson(journalFile, journal);
        }
      } else {
        for (const previous of entry.before) {
          const url = `https://firebaseappcheck.googleapis.com/v1beta/${previous.name}`;
          const current = await api(url, token);
          if (current.enforcementMode === previous.enforcementMode) {
            entry.rollbackTargets[previous.name] = { status: 'verified' };
            writeJson(journalFile, journal); continue;
          }
          entry.rollbackTargets[previous.name] = { status: 'requesting', observedEtag: current.etag };
          writeJson(journalFile, journal);
          await api(`${url}?updateMask=enforcementMode`, token, 'PATCH', { ...current, enforcementMode: previous.enforcementMode });
          entry.rollbackTargets[previous.name] = { status: 'requested' }; writeJson(journalFile, journal);
        }
      }
      entry.status = 'rollback-pending-verification'; writeJson(journalFile, journal);
      return { mode: entry.status, batch: batch.id, required: 'Independently verify traffic/configuration and successful client behavior before continuing.' };
    }
    requirePrevious(manifest, journal, batch);
    for (const previous of manifest.batches.slice(0, manifest.batches.indexOf(batch))) {
      if (hash(batchState(previous, live)) !== hash(journal.batches[previous.id].postState)) throw new Error(`Previously accepted batch changed: ${previous.id}.`);
      await assertServing(previous, live, token);
    }
    if (entry) throw new Error(`Batch already recorded as ${entry.status}; verify/accept/rollback instead of redeploying.`);
    const before = batchState(batch, live);
    if (hash(before) !== hash(batchState(batch, manifest.baseline))) throw new Error('Target state drifted from baseline.');
    await assertServing(batch, live, token);
    if (batch.id === 'storage' || batch.id === 'authentication') {
      const evidence = JSON.parse(fs.readFileSync(path.resolve(options.evidence || ''), 'utf8'));
      if (evidence.manifestSha256 !== manifest.manifestSha256 || evidence.batch !== batch.id
        || evidence.checks?.ios !== true || evidence.checks?.android !== true || evidence.checks?.web !== true
        || evidence.checks?.[batch.id === 'storage' ? 'uploadBeforeEnforcement' : 'freshSignInBeforeEnforcement'] !== true
        || !evidence.receipts?.length) throw new Error('Missing pre-enforcement platform evidence.');
    }
    journal.batches[batch.id] = { status: 'deploying', manifestSha256: manifest.manifestSha256, startedAt: new Date().toISOString(), before };
    writeJson(journalFile, journal);
    if (batch.kind === 'functions') {
      const env = fs.readFileSync(ENV_FILE, 'utf8');
      fs.writeFileSync(ENV_FILE, setEnforcementEnv(env, true, manifest.source.sha256));
      const targets = batch.targets.map((name) => `functions:${name}`).join(',');
      const args = ['-y', 'firebase-tools@latest', 'deploy', '--project', PROJECT, '--account', 'doric9@gmail.com', '--only', targets, '--non-interactive'];
      // All command arguments are fixed constants or validated source identifiers.
      const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args,
        { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true,
          env: { ...process.env, PLANLI_ENFORCE_APP_CHECK: 'true', PLANLI_APP_CHECK_ROLLOUT_SOURCE: manifest.source.sha256 } });
      if (result.error || result.status !== 0) throw new Error('Deployment incomplete/uncertain; inspect inventory and use --verify. Never blindly repeat.');
    } else {
      const previous = before[0];
      await api(`https://firebaseappcheck.googleapis.com/v1beta/${previous.name}?updateMask=enforcementMode`, token,
        'PATCH', { ...previous, enforcementMode: 'ENFORCED' });
    }
    const post = safeInventory(await inventory(token));
    if (batch.kind === 'functions') await resolveServing(post, token, batch.targets);
    if (!verifyEnabled(batch, post, manifest.source.sha256)) throw new Error('Read-back did not confirm enforcement/source. Use --verify after checking provider state.');
    await assertServing(batch, post, token);
    const applied = journal.batches[batch.id];
    applied.status = 'applied'; applied.appliedAt = new Date().toISOString(); applied.postState = batchState(batch, post);
    writeJson(journalFile, journal);
    return { mode: 'applied', batch: batch.id, appliedAt: applied.appliedAt, postStateSha256: hash(applied.postState), next: 'Collect smoke evidence; this batch is not accepted yet.' };
  } finally { fs.unlinkSync(lock); }
}

if (require.main === module) execute(parseArgs(process.argv.slice(2))).then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => { console.error(`App Check rollout stopped: ${error.message}`); process.exitCode = 1; });
module.exports = { batchesFor, setEnforcementEnv, safeInventory, assertInventory, batchState, verifyEnabled,
  assertEvidence, requirePrevious, parseArgs, validateManifest, hash, CONFIRM, execute };
module.exports.trafficServesRevision = trafficServesRevision;
module.exports.assertServing = assertServing;
module.exports.resolveServing = resolveServing;
module.exports.restoreTraffic = restoreTraffic;
module.exports.assertSourceCompatible = assertSourceCompatible;
