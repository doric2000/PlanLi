#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gcloudAccessToken } = require('../functions/scripts/localCredentials');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'security-monitoring.json');
const PRODUCTION_PROJECT = 'planli-f0b12';
const CONFIRMATION = 'APPLY PLANLI PRODUCTION SECURITY MONITORING';

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
  if (plan?.schemaVersion !== 1 || plan.projectId !== PRODUCTION_PROJECT) {
    throw new Error('Monitoring plan must target the exact production project and schema.');
  }
  if (plan.channel?.type !== 'email' || plan.channel?.labels?.email_address !== 'doric9@gmail.com' ||
      plan.channel?.userLabels?.planli_control !== 'security-alert-email') {
    throw new Error('Monitoring plan email channel is not the reviewed PlanLi channel.');
  }
  if (!Array.isArray(plan.policies) || plan.policies.length !== 4) {
    throw new Error('Monitoring plan must contain exactly four policies.');
  }
  const ids = plan.policies.map((policy) => policy?.userLabels?.planli_control);
  if (new Set(ids).size !== ids.length || ids.some((id) => !id)) {
    throw new Error('Monitoring policy control IDs must be present and unique.');
  }
  for (const policy of plan.policies) {
    if (policy.userLabels?.managed_by !== 'planli' || policy.combiner !== 'OR' ||
        !Array.isArray(policy.conditions) || policy.conditions.length !== 1 ||
        !['CRITICAL', 'ERROR', 'WARNING'].includes(policy.severity)) {
      throw new Error(`Invalid monitoring policy: ${policy.displayName || '<unnamed>'}`);
    }
    const isLog = Boolean(policy.conditions[0].conditionMatchedLog);
    if (isLog && !policy.alertStrategy?.notificationRateLimit?.period) {
      throw new Error(`Log policy lacks a notification rate limit: ${policy.displayName}`);
    }
  }
  const appCheck = plan.policies.find((policy) =>
    policy.userLabels.planli_control === 'app-check-rejected');
  if (!appCheck || appCheck.enabled !== false) {
    throw new Error('App Check rejection policy must remain disabled until enforcement.');
  }
  const provider = plan.policies.find((policy) =>
    policy.userLabels.planli_control === 'location-provider-429');
  if (!provider?.conditions[0]?.conditionMatchedLog?.filter.includes('jsonPayload.providerStatus=429')) {
    throw new Error('Provider quota alert must use the structured providerStatus field.');
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

async function requestJson(url, accessToken, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Cloud Monitoring request failed with HTTP ${response.status}.`);
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function listResources(project, collection, accessToken) {
  const values = [];
  let pageToken = '';
  do {
    const url = new URL(`https://monitoring.googleapis.com/v3/projects/${project}/${collection}`);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const payload = await requestJson(url, accessToken);
    values.push(...(payload[collection] || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return values;
}

function policyBody(policy, channelName) {
  return { ...policy, notificationChannels: [channelName] };
}

function comparablePolicy(policy) {
  const keys = ['displayName', 'documentation', 'userLabels', 'conditions', 'combiner',
    'enabled', 'notificationChannels', 'alertStrategy', 'severity'];
  const comparable = Object.fromEntries(keys.map((key) => [key, policy[key]]));
  comparable.conditions = (comparable.conditions || []).map(({ name, ...condition }) => condition);
  return comparable;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function buildActions(plan, channels, policies) {
  const controlledChannels = channels.filter((entry) =>
    entry.userLabels?.planli_control === plan.channel.userLabels.planli_control);
  if (controlledChannels.length > 1) throw new Error('Multiple managed PlanLi security channels exist.');
  const channel = controlledChannels[0] || null;
  if (channel && !same(
    Object.fromEntries(Object.keys(plan.channel).map((key) => [key, channel[key]])),
    plan.channel
  )) throw new Error('Existing managed security channel differs from the reviewed manifest.');

  const actions = [{
    control: plan.channel.userLabels.planli_control,
    action: channel ? 'reuse-channel' : 'create-channel-and-send-verification',
  }];
  for (const desired of plan.policies) {
    const control = desired.userLabels.planli_control;
    const matches = policies.filter((entry) => entry.userLabels?.planli_control === control);
    if (matches.length > 1) throw new Error(`Multiple policies exist for ${control}.`);
    if (!matches.length) actions.push({ control, action: 'create-policy', enabled: desired.enabled });
    else {
      if (!channel || !same(comparablePolicy(matches[0]), comparablePolicy(policyBody(desired, channel.name)))) {
        throw new Error(`Existing policy differs from the reviewed manifest: ${control}.`);
      }
      actions.push({ control, action: 'reuse-policy', enabled: desired.enabled });
    }
  }
  return { actions, channel };
}

async function execute(options = {}) {
  const plan = loadPlan(options.configPath || CONFIG_PATH);
  const hash = manifestHash(plan);
  assertApplyGates(options, hash);
  const accessToken = (options.tokenProvider || gcloudAccessToken)().access_token;
  let channels = await listResources(plan.projectId, 'notificationChannels', accessToken);
  let policies = await listResources(plan.projectId, 'alertPolicies', accessToken);
  let state = buildActions(plan, channels, policies);
  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: plan.projectId,
    manifestSha256: hash,
    actions: state.actions,
  };
  if (!options.apply) return result;

  let channel = state.channel;
  if (!channel) {
    channel = await requestJson(
      `https://monitoring.googleapis.com/v3/projects/${plan.projectId}/notificationChannels`,
      accessToken,
      { method: 'POST', body: plan.channel }
    );
    await requestJson(`https://monitoring.googleapis.com/v3/${channel.name}:sendVerificationCode`,
      accessToken, { method: 'POST', body: {} });
  }
  for (const policy of plan.policies) {
    const control = policy.userLabels.planli_control;
    if (policies.some((entry) => entry.userLabels?.planli_control === control)) continue;
    await requestJson(
      `https://monitoring.googleapis.com/v3/projects/${plan.projectId}/alertPolicies`,
      accessToken,
      { method: 'POST', body: policyBody(policy, channel.name) }
    );
  }
  channels = await listResources(plan.projectId, 'notificationChannels', accessToken);
  policies = await listResources(plan.projectId, 'alertPolicies', accessToken);
  state = buildActions(plan, channels, policies);
  if (state.actions.some((entry) => !entry.action.startsWith('reuse-'))) {
    throw new Error('Monitoring read-back did not match the reviewed manifest.');
  }
  return {
    ...result,
    channelName: state.channel.name,
    verificationStatus: state.channel.verificationStatus || 'UNVERIFIED',
    policyCount: plan.policies.length,
    readBackVerified: true,
  };
}

if (require.main === module) {
  execute(parseArgs(process.argv.slice(2))).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === 'dry-run') {
      process.stdout.write(`No production state changed. Apply additionally requires --manifest-hash and --confirm \"${CONFIRMATION}\".\n`);
    }
  }).catch((error) => {
    process.stderr.write(`Security monitoring plan failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  assertApplyGates,
  buildActions,
  loadPlan,
  manifestHash,
  parseArgs,
  policyBody,
  validatePlan,
};
