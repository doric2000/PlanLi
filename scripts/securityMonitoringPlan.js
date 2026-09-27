#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gcloudAccessToken } = require('../functions/scripts/localCredentials');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'security-monitoring.json');
const PRODUCTION_PROJECT = 'planli-f0b12';
const CONFIRMATION = 'APPLY PLANLI PRODUCTION SECURITY MONITORING';
const APP_CHECK_CONTROLS = ['app-check-rejected', 'app-check-service-rejected'];

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
  if (!Array.isArray(plan.policies) || ![4, 5].includes(plan.policies.length)) {
    throw new Error('Monitoring plan must contain four base policies and at most one App Check service policy.');
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
  if (!appCheck || (appCheck.enabled !== false && !plan.appCheckRollout)) {
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
    else if (key === '--app-check-rollout') options.appCheckRollout = true;
    else if (['--project', '--manifest-hash', '--state-hash', '--confirm'].includes(key)) {
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
      'x-goog-user-project': PRODUCTION_PROJECT,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
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

function buildActions(plan, channels, policies, { allowAppCheckUpdate = false } = {}) {
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
        if (!channel || !allowAppCheckUpdate || !APP_CHECK_CONTROLS.includes(control)) {
          throw new Error(`Existing policy differs from the reviewed manifest: ${control}.`);
        }
        const before = comparablePolicy(matches[0]);
        const after = comparablePolicy(policyBody(desired, channel.name));
        const unchanged = ['displayName', 'userLabels', 'combiner', 'notificationChannels', 'alertStrategy', 'severity'];
        if (unchanged.some((key) => !same(before[key], after[key]))) {
          throw new Error(`Unreviewed App Check policy drift: ${control}.`);
        }
        actions.push({ control, action: 'update-app-check-policy', name: matches[0].name,
          beforeSha256: manifestHash(before), enabled: desired.enabled });
        continue;
      }
      actions.push({ control, action: 'reuse-policy', enabled: desired.enabled });
    }
  }
  return { actions, channel };
}

function appCheckRolloutPlan(base, functions, services) {
  const plan = structuredClone(base);
  const targets = functions.filter((entry) => entry.labels?.['deployment-callable'] === 'true'
    && entry.state === 'ACTIVE' && entry.serviceConfig?.environmentVariables?.PLANLI_ENFORCE_APP_CHECK === 'true')
    .map((entry) => entry.name.split('/').pop().toLowerCase()).sort();
  if (targets.some((target) => !/^[a-z][a-z0-9]+$/.test(target))) throw new Error('Invalid callable service identity.');
  const serviceIds = ['firestore.googleapis.com', 'firebasestorage.googleapis.com', 'identitytoolkit.googleapis.com'];
  const enforcedServices = services.filter((entry) => entry.enforcementMode === 'ENFORCED'
    && serviceIds.includes(entry.name.split('/').pop())).map((entry) => entry.name.split('/').pop()).sort();
  plan.appCheckRollout = { targets, services: enforcedServices };
  const callablePolicy = plan.policies.find((policy) => policy.userLabels.planli_control === 'app-check-rejected');
  callablePolicy.enabled = targets.length > 0;
  callablePolicy.documentation.content = 'An enforced callable rejected an App Check token. Correlate intentional probes and known-good client failures before rolling back the affected rollout batch.';
  const servicesFilter = targets.length ? targets.map((name) => `"${name}"`).join(' OR ') : '"no-enforced-planli-callable"';
  callablePolicy.conditions[0].conditionMatchedLog.filter = `resource.type="cloud_run_revision" AND resource.labels.service_name=(${servicesFilter}) AND ((labels."firebase-log-type"="callable-request-verification" AND (jsonPayload.verifications.app=("MISSING" OR "INVALID") OR jsonPayload.verifications.appCheck=("MISSING" OR "INVALID"))) OR (jsonPayload.message="app_check_rejected" AND jsonPayload.reason="APP_CHECK_REPLAYED"))`;
  plan.policies.push({
    displayName: 'PlanLi Error - App Check service rejected request',
    documentation: { content: 'App Check denied a Firestore, Storage or Authentication request. Compare platform smoke results and deliberate probes; a rejection alone does not identify a legitimate client.', mimeType: 'text/markdown' },
    userLabels: { managed_by: 'planli', planli_control: 'app-check-service-rejected' },
    conditions: [{ displayName: 'App Check service denied requests', conditionThreshold: {
      filter: `resource.type="firebaseappcheck.googleapis.com/Service" AND metric.type="firebaseappcheck.googleapis.com/services/verification_count" AND metric.labels.result="DENY" AND resource.labels.service_id=one_of(${serviceIds.map((id) => `"${id}"`).join(', ')})`,
      aggregations: [{ alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_SUM', crossSeriesReducer: 'REDUCE_SUM', groupByFields: ['resource.label.service_id'] }],
      comparison: 'COMPARISON_GT', thresholdValue: 0, duration: '0s', trigger: { count: 1 },
    } }],
    combiner: 'OR', enabled: enforcedServices.length > 0,
    alertStrategy: { notificationPrompts: ['OPENED', 'CLOSED'], autoClose: '1800s' }, severity: 'ERROR',
  });
  validatePlan(plan);
  return plan;
}

function monitoringStateHash(channels, policies) {
  return manifestHash({
    channels: channels.filter((item) => item.userLabels?.planli_control === 'security-alert-email'),
    policies: policies.filter((item) => item.userLabels?.managed_by === 'planli')
      .map((item) => ({ name: item.name, ...comparablePolicy(item) })).sort((a, b) => a.name.localeCompare(b.name)),
  });
}

async function servingFunctions(functions, accessToken) {
  const result = [];
  // Read only potential enforced callables. A traffic rollback can leave newer
  // Functions metadata behind, so scope alerts using the serving revision.
  const candidates = functions.filter((entry) => entry.labels?.['deployment-callable'] === 'true'
    && entry.serviceConfig?.environmentVariables?.PLANLI_ENFORCE_APP_CHECK === 'true');
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const resolved = await Promise.all(candidates.slice(offset, offset + 5).map(async (entry) => {
      const service = await requestJson(`https://run.googleapis.com/v2/${entry.serviceConfig.service}`, accessToken);
      const traffic = (service.trafficStatuses || []).filter((target) => Number(target.percent) > 0);
      if (service.reconciling || traffic.length !== 1 || Number(traffic[0].percent) !== 100) {
        throw new Error(`Unstable App Check traffic: ${entry.name.split('/').pop()}.`);
      }
      const revisionId = traffic[0].revision.split('/').pop();
      if (revisionId === entry.serviceConfig.revision) return entry;
      const revision = await requestJson(`https://run.googleapis.com/v2/${entry.serviceConfig.service}/revisions/${revisionId}`, accessToken);
      const enforced = revision.containers?.some((container) => container.env?.some((env) => env.name === 'PLANLI_ENFORCE_APP_CHECK' && env.value === 'true'));
      return { ...entry, serviceConfig: { ...entry.serviceConfig,
        environmentVariables: { PLANLI_ENFORCE_APP_CHECK: enforced ? 'true' : 'false' } } };
    }));
    result.push(...resolved);
  }
  return result;
}

async function execute(options = {}) {
  let plan = loadPlan(options.configPath || CONFIG_PATH);
  const accessToken = (options.tokenProvider || gcloudAccessToken)().access_token;
  if (options.appCheckRollout) {
    const functions = await requestJson(`https://cloudfunctions.googleapis.com/v2/projects/${PRODUCTION_PROJECT}/locations/europe-west1/functions?pageSize=1000`, accessToken);
    if (functions.nextPageToken) throw new Error('Incomplete Functions inventory.');
    const services = await requestJson('https://firebaseappcheck.googleapis.com/v1beta/projects/633543026638/services', accessToken);
    plan = appCheckRolloutPlan(plan, await servingFunctions(functions.functions || [], accessToken), services.services || []);
  }
  const hash = manifestHash(plan);
  assertApplyGates(options, hash);
  let channels = await listResources(plan.projectId, 'notificationChannels', accessToken);
  let policies = await listResources(plan.projectId, 'alertPolicies', accessToken);
  const stateHash = monitoringStateHash(channels, policies);
  if (options.apply && options.appCheckRollout && options.stateHash !== stateHash) {
    throw new Error('Monitoring state changed or --state-hash was not supplied. Repeat the dry run.');
  }
  let state = buildActions(plan, channels, policies, { allowAppCheckUpdate: options.appCheckRollout });
  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: plan.projectId,
    manifestSha256: hash,
    stateSha256: stateHash,
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
    const action = state.actions.find((entry) => entry.control === control);
    if (action?.action === 'update-app-check-policy') {
      const current = await requestJson(`https://monitoring.googleapis.com/v3/${action.name}`, accessToken);
      if (manifestHash(comparablePolicy(current)) !== action.beforeSha256) throw new Error(`Concurrent policy change: ${control}.`);
      await requestJson(`https://monitoring.googleapis.com/v3/${action.name}?updateMask=conditions,enabled,documentation`, accessToken, {
        method: 'PATCH', body: { name: action.name, enabled: policy.enabled, documentation: policy.documentation,
          conditions: policy.conditions.map((condition, index) => ({ ...condition, name: current.conditions[index].name })) },
      });
      continue;
    }
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
    verificationStatus: state.channel.verificationStatus || 'VERIFICATION_STATUS_UNSPECIFIED',
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
  appCheckRolloutPlan,
  comparablePolicy,
  monitoringStateHash,
  execute,
};
