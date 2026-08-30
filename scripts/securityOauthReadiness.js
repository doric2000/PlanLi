#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'security-oauth-rollout.json');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validatePlan(plan) {
  const expectedFunctions = [
    'publishRecommendationDraft', 'publishRouteDraft', 'refreshDestinationCachesScheduled',
    'resolvePlaceSelection', 'resolveRecommendationDestination', 'saveRecommendation',
    'saveRoute', 'searchPlaces',
  ];
  const expectedKeys = [
    { uid: '1c999850-18fb-4b03-984e-ce90ed6dd872', displayName: 'Places API' },
    { uid: '9fea6ed1-d5d6-4c9b-8205-48dd0da9cefb', displayName: 'PlanLi Places API New server' },
  ];
  if (plan?.schemaVersion !== 1 || plan.projectId !== 'planli-f0b12' ||
      plan.region !== 'europe-west1' ||
      plan.serviceAccount !== 'planli-core-functions@planli-f0b12.iam.gserviceaccount.com' ||
      JSON.stringify(plan.requiredServices) !== JSON.stringify([
        'geocoding-backend.googleapis.com', 'places.googleapis.com',
      ]) || plan.requiredRole !== 'roles/serviceusage.serviceUsageConsumer' ||
      JSON.stringify(plan.functionTargets) !== JSON.stringify(expectedFunctions) ||
      JSON.stringify(plan.legacySecrets) !== JSON.stringify([
        'GOOGLE_MAPS_KEY', 'GOOGLE_PLACES_NEW_KEY',
      ]) || JSON.stringify(plan.apiKeyDeletionTargets) !== JSON.stringify(expectedKeys)) {
    throw new Error('OAuth rollout manifest differs from the reviewed production scope.');
  }
  return true;
}

function loadPlan(configPath = CONFIG_PATH) {
  const plan = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  validatePlan(plan);
  return plan;
}

function manifestHash(plan) {
  return sha256(JSON.stringify(stable(plan)));
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

function parseJson(value, fallback) {
  const text = String(value || '').trim();
  return text ? JSON.parse(text) : fallback;
}

function localSourceState(plan, readFile = fs.readFileSync) {
  const indexSource = readFile(path.join(REPO_ROOT, 'functions', 'index.js'), 'utf8');
  const legacyAdapterExists = fs.existsSync(path.join(REPO_ROOT, 'functions', 'legacyPlacesAdapter.js'));
  const boundLegacySecrets = plan.legacySecrets.filter((secret) =>
    new RegExp(`defineSecret\\(['\"]${secret}['\"]\\)`, 'u').test(indexSource)
  );
  return {
    legacyAdapterExists,
    boundLegacySecrets,
    oauthModuleExists: fs.existsSync(path.join(REPO_ROOT, 'functions', 'googleMapsOAuth.js')),
  };
}

function summarize(plan, inventory, sourceState = localSourceState(plan)) {
  const enabledServices = new Set((inventory.enabledServices || [])
    .map((entry) => entry.config?.name || entry.name)
    .filter(Boolean));
  const missingServices = plan.requiredServices.filter((service) => !enabledServices.has(service));
  const serviceAccountMember = `serviceAccount:${plan.serviceAccount}`;
  const matchingRoleBindings = (inventory.iam?.bindings || [])
    .filter((binding) => binding.role === plan.requiredRole);
  const serviceUsageRoleGranted = matchingRoleBindings.some((binding) =>
    !binding.condition && (binding.members || []).includes(serviceAccountMember)
  );
  const conditionalServiceUsageBindings = matchingRoleBindings
    .filter((binding) => binding.condition && (binding.members || []).includes(serviceAccountMember))
    .map((binding) => binding.condition);
  const byEntryPoint = new Map((inventory.functions || []).map((cloudFunction) => [
    cloudFunction.buildConfig?.entryPoint || cloudFunction.name?.split('/').pop(), cloudFunction,
  ]));
  const missingFunctions = plan.functionTargets.filter((name) => !byEntryPoint.has(name));
  const legacyBindings = [];
  const wrongServiceAccounts = [];
  for (const name of plan.functionTargets) {
    const cloudFunction = byEntryPoint.get(name);
    if (!cloudFunction) continue;
    const secrets = (cloudFunction.serviceConfig?.secretEnvironmentVariables || [])
      .map((secret) => secret.key || secret.secret)
      .filter((secret) => plan.legacySecrets.includes(secret))
      .sort();
    if (secrets.length) legacyBindings.push({ function: name, secrets });
    if (cloudFunction.serviceConfig?.serviceAccountEmail !== plan.serviceAccount) {
      wrongServiceAccounts.push(name);
    }
  }
  const keyByUid = new Map((inventory.apiKeys || []).map((key) => [key.uid, key]));
  const apiKeyTargets = plan.apiKeyDeletionTargets.map((target) => {
    const key = keyByUid.get(target.uid);
    return {
      uid: target.uid,
      expectedDisplayName: target.displayName,
      exists: Boolean(key),
      identityMatches: Boolean(key && key.displayName === target.displayName),
    };
  });
  const secretNames = new Set((inventory.secrets || []).map((secret) =>
    String(secret.name || '').split('/').pop()
  ));
  const legacySecretResources = plan.legacySecrets.filter((secret) => secretNames.has(secret));
  const sourceReady = sourceState.oauthModuleExists && !sourceState.legacyAdapterExists &&
    sourceState.boundLegacySecrets.length === 0;
  const readyToDeployOauth = sourceReady && missingServices.length === 0 &&
    serviceUsageRoleGranted && missingFunctions.length === 0 && wrongServiceAccounts.length === 0 &&
    apiKeyTargets.every((target) => target.exists && target.identityMatches);
  const readyToDeleteLegacyCredentials = readyToDeployOauth && legacyBindings.length === 0;
  return {
    missingServices,
    serviceUsageRoleGranted,
    conditionalServiceUsageBindings,
    missingFunctions,
    wrongServiceAccounts,
    legacyBindings,
    legacySecretResources,
    apiKeyTargets,
    sourceState,
    readyToDeployOauth,
    readyToDeleteLegacyCredentials,
  };
}

function collectInventory(plan, gcloud = runGcloud) {
  return {
    enabledServices: parseJson(gcloud([
      'services', 'list', '--enabled', '--project', plan.projectId,
      '--format=json(config.name)', '--quiet',
    ]), []),
    iam: parseJson(gcloud([
      'projects', 'get-iam-policy', plan.projectId, '--format=json', '--quiet',
    ]), {}),
    functions: parseJson(gcloud([
      'functions', 'list', '--v2', `--regions=${plan.region}`, '--project', plan.projectId,
      '--format=json(name,buildConfig.entryPoint,serviceConfig.secretEnvironmentVariables,serviceConfig.serviceAccountEmail,state)',
      '--quiet',
    ]), []),
    apiKeys: parseJson(gcloud([
      'services', 'api-keys', 'list', '--project', plan.projectId,
      '--format=json(uid,displayName,name,restrictions)', '--quiet',
    ]), []),
    secrets: parseJson(gcloud([
      'secrets', 'list', '--project', plan.projectId, '--format=json(name)', '--quiet',
    ]), []),
  };
}

function execute({ configPath = CONFIG_PATH, gcloud = runGcloud, readFile } = {}) {
  const plan = loadPlan(configPath);
  const report = summarize(plan, collectInventory(plan, gcloud), localSourceState(plan, readFile));
  return {
    mode: 'read-only',
    projectId: plan.projectId,
    manifestSha256: manifestHash(plan),
    ...report,
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(execute(), null, 2)}\n`);
    process.stdout.write('No production state changed. API keys and secrets are deletion targets only after OAuth deploy and smoke/read-back.\n');
  } catch (error) {
    process.stderr.write(`OAuth readiness audit failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  execute,
  loadPlan,
  localSourceState,
  manifestHash,
  summarize,
  validatePlan,
};
