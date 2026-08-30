#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gcloudAccessToken } = require('../functions/scripts/localCredentials');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'security-production-prerequisites.json');
const PRODUCTION_PROJECT = 'planli-f0b12';
const CONFIRMATION = 'APPLY PLANLI PRODUCTION SECURITY PREREQUISITES';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadPlan(configPath = CONFIG_PATH) {
  const plan = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  validatePlan(plan);
  return plan;
}

function validatePlan(plan) {
  if (plan?.schemaVersion !== 1 || plan.projectId !== PRODUCTION_PROJECT ||
      plan.projectNumber !== '633543026638') throw new Error('Invalid production project manifest.');
  const expectedServices = [
    'cloudquotas.googleapis.com', 'firebaseappcheck.googleapis.com', 'geocoding-backend.googleapis.com',
    'playintegrity.googleapis.com', 'recaptchaenterprise.googleapis.com',
  ];
  if (JSON.stringify(plan.services) !== JSON.stringify(expectedServices)) {
    throw new Error('Production prerequisite service list differs from the reviewed scope.');
  }
  if (plan.serviceUsageGrant?.member !==
      'serviceAccount:planli-core-functions@planli-f0b12.iam.gserviceaccount.com' ||
      plan.serviceUsageGrant?.role !== 'roles/serviceusage.serviceUsageConsumer') {
    throw new Error('Production prerequisite IAM grant differs from the reviewed scope.');
  }
  if (plan.appCheckVerifierGrant?.member !== plan.serviceUsageGrant.member ||
      plan.appCheckVerifierGrant?.role !== 'roles/firebaseappcheck.tokenVerifier') {
    throw new Error('Production App Check verifier grant differs from the reviewed scope.');
  }
  if (plan.mediaAppCheckVerifierGrant?.member !==
      'serviceAccount:planli-media-functions@planli-f0b12.iam.gserviceaccount.com' ||
      plan.mediaAppCheckVerifierGrant?.role !== 'roles/firebaseappcheck.tokenVerifier') {
    throw new Error('Production media App Check verifier grant differs from the reviewed scope.');
  }
  if (plan.iosApp?.appId !== '1:633543026638:ios:b13b28c424e4c9e846ad9f' ||
      plan.iosApp?.bundleId !== 'com.planli.planlitravels' ||
      plan.iosApp?.teamId !== 'C22ZFVA6M6') {
    throw new Error('Production prerequisite iOS identity differs from the reviewed scope.');
  }
  return true;
}

function manifestHash(plan) {
  return sha256(JSON.stringify(stable(plan)));
}

function parseArgs(argv) {
  const options = { apply: false, project: '', manifestHash: '', confirm: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--apply') options.apply = true;
    else if (['--project', '--manifest-hash', '--confirm'].includes(key)) {
      options[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] =
        String(argv[index + 1] || '').trim();
      index += 1;
    } else throw new Error(`Unknown argument: ${key}`);
  }
  if (options.project && options.project !== PRODUCTION_PROJECT) {
    throw new Error('Refusing a project other than planli-f0b12.');
  }
  return options;
}

function assertApplyGates(options, hash) {
  if (!options.apply) return;
  if (options.project !== PRODUCTION_PROJECT) throw new Error('Apply requires --project planli-f0b12.');
  if (options.manifestHash !== hash) throw new Error('Apply manifest hash mismatch.');
  if (options.confirm !== CONFIRMATION) throw new Error('Apply typed confirmation mismatch.');
}

function runGcloud(args, runner = spawnSync) {
  const command = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  const result = runner(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
    timeout: 5 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error(`gcloud could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gcloud ${args[0]} failed.`);
  return String(result.stdout || '').trim();
}

async function firebaseIosApps(projectId, accessToken) {
  const response = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/iosApps`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Goog-User-Project': projectId,
    },
  });
  if (!response.ok) throw new Error(`Firebase iOS app inventory failed with HTTP ${response.status}.`);
  return (await response.json()).apps || [];
}

async function readState(plan, dependencies = {}) {
  const gcloud = dependencies.gcloud || runGcloud;
  const tokenProvider = dependencies.tokenProvider || gcloudAccessToken;
  const enabledRows = JSON.parse(gcloud([
    'services', 'list', '--enabled', '--project', plan.projectId, '--format=json(config.name)', '--quiet',
  ]) || '[]');
  const enabledServices = new Set(enabledRows.map((entry) => entry.config?.name).filter(Boolean));
  const iam = JSON.parse(gcloud([
    'projects', 'get-iam-policy', plan.projectId, '--format=json', '--quiet',
  ]) || '{}');
  const hasGrant = ({ role, member }) => {
    const binding = (iam.bindings || []).find((entry) => entry.role === role);
    return (binding?.members || []).includes(member);
  };
  const serviceUsageGranted = hasGrant(plan.serviceUsageGrant);
  const appCheckVerifierGranted = hasGrant(plan.appCheckVerifierGrant);
  const mediaAppCheckVerifierGranted = hasGrant(plan.mediaAppCheckVerifierGrant);
  const accessToken = tokenProvider().access_token;
  const apps = dependencies.iosApps || await firebaseIosApps(plan.projectId, accessToken);
  const app = apps.find((entry) => entry.appId === plan.iosApp.appId);
  if (!app || app.bundleId !== plan.iosApp.bundleId || app.state !== 'ACTIVE') {
    throw new Error('Exact active production iOS Firebase app was not found.');
  }
  return {
    missingServices: plan.services.filter((service) => !enabledServices.has(service)),
    serviceUsageGranted,
    appCheckVerifierGranted,
    mediaAppCheckVerifierGranted,
    iosApp: app,
    teamIdMatches: app.teamId === plan.iosApp.teamId,
  };
}

function actionsFor(plan, state) {
  return [
    ...plan.services.map((service) => ({
      control: service,
      action: state.missingServices.includes(service) ? 'enable-service' : 'reuse-enabled-service',
    })),
    {
      control: plan.serviceUsageGrant.role,
      action: state.serviceUsageGranted ? 'reuse-iam-grant' : 'add-iam-grant',
      member: plan.serviceUsageGrant.member,
    },
    {
      control: plan.appCheckVerifierGrant.role,
      action: state.appCheckVerifierGranted ? 'reuse-iam-grant' : 'add-iam-grant',
      member: plan.appCheckVerifierGrant.member,
    },
    {
      control: plan.mediaAppCheckVerifierGrant.role,
      action: state.mediaAppCheckVerifierGranted ? 'reuse-iam-grant' : 'add-iam-grant',
      member: plan.mediaAppCheckVerifierGrant.member,
    },
    {
      control: 'ios-firebase-team-id',
      action: state.teamIdMatches ? 'reuse-team-id' : 'patch-team-id',
      appId: plan.iosApp.appId,
      teamId: plan.iosApp.teamId,
    },
  ];
}

async function patchIosTeamId(plan, app, accessToken) {
  const url = new URL(`https://firebase.googleapis.com/v1beta1/${app.name}`);
  url.searchParams.set('updateMask', 'teamId');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Goog-User-Project': plan.projectId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: app.name, teamId: plan.iosApp.teamId, etag: app.etag }),
  });
  if (!response.ok) throw new Error(`Firebase iOS Team ID patch failed with HTTP ${response.status}.`);
  return response.json();
}

async function execute(options = {}) {
  const plan = loadPlan(options.configPath || CONFIG_PATH);
  const hash = manifestHash(plan);
  assertApplyGates(options, hash);
  const dependencies = options.dependencies || {};
  const before = await readState(plan, dependencies);
  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: plan.projectId,
    manifestSha256: hash,
    actions: actionsFor(plan, before),
  };
  if (!options.apply) return result;
  const gcloud = dependencies.gcloud || runGcloud;
  if (before.missingServices.length) gcloud([
    'services', 'enable', ...before.missingServices, '--project', plan.projectId, '--quiet',
  ]);
  if (!before.serviceUsageGranted) gcloud([
    'projects', 'add-iam-policy-binding', plan.projectId,
    '--member', plan.serviceUsageGrant.member, '--role', plan.serviceUsageGrant.role,
    '--condition=None', '--quiet',
  ]);
  if (!before.appCheckVerifierGranted) gcloud([
    'projects', 'add-iam-policy-binding', plan.projectId,
    '--member', plan.appCheckVerifierGrant.member, '--role', plan.appCheckVerifierGrant.role,
    '--condition=None', '--quiet',
  ]);
  if (!before.mediaAppCheckVerifierGranted) gcloud([
    'projects', 'add-iam-policy-binding', plan.projectId,
    '--member', plan.mediaAppCheckVerifierGrant.member,
    '--role', plan.mediaAppCheckVerifierGrant.role, '--condition=None', '--quiet',
  ]);
  if (!before.teamIdMatches) {
    const accessToken = (dependencies.tokenProvider || gcloudAccessToken)().access_token;
    await (dependencies.patchIosTeamId || patchIosTeamId)(plan, before.iosApp, accessToken);
  }
  const after = await readState(plan, dependencies);
  if (after.missingServices.length || !after.serviceUsageGranted ||
      !after.appCheckVerifierGranted || !after.mediaAppCheckVerifierGranted ||
      !after.teamIdMatches) {
    throw new Error('Production prerequisite read-back did not match the manifest.');
  }
  return { ...result, readBackVerified: true };
}

if (require.main === module) {
  execute(parseArgs(process.argv.slice(2))).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === 'dry-run') {
      process.stdout.write(`No production state changed. Apply additionally requires --manifest-hash and --confirm \"${CONFIRMATION}\".\n`);
    }
  }).catch((error) => {
    process.stderr.write(`Production security prerequisite plan failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  actionsFor,
  assertApplyGates,
  loadPlan,
  manifestHash,
  parseArgs,
  validatePlan,
};
