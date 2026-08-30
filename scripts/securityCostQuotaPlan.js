#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'security-cost-quotas.json');
const PRODUCTION_PROJECT = 'planli-f0b12';
const CONFIRMATION = 'APPLY PLANLI PRODUCTION NO COST QUOTAS';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validatePlan(plan) {
  if (plan?.schemaVersion !== 1 || plan.projectId !== PRODUCTION_PROJECT ||
      plan.policy !== 'no-cost-launch-guardrails') {
    throw new Error('Cost-quota plan must target the reviewed production project and policy.');
  }
  if (!Array.isArray(plan.quotas) || plan.quotas.length !== 22) {
    throw new Error('Cost-quota plan must contain exactly 22 reviewed quota controls.');
  }
  const ids = new Set();
  for (const quota of plan.quotas) {
    const id = `${quota?.service || ''}:${quota?.quotaId || ''}`;
    if (!/^[a-z0-9.-]+\.googleapis\.com$/.test(quota?.service || '') ||
        !/^[A-Za-z0-9-]+$/.test(quota?.quotaId || '') || ids.has(id) ||
        !Number.isSafeInteger(quota?.preferredValue) || quota.preferredValue < 0 ||
        typeof quota?.purpose !== 'string' || !quota.purpose.trim()) {
      throw new Error(`Invalid quota control: ${id}`);
    }
    ids.add(id);
  }
  const required = new Map([
    ['places.googleapis.com:AutocompletePlacesRequestPerDayPerProject', 300],
    ['places.googleapis.com:GetPlaceRequestPerDayPerProject', 150],
    ['places.googleapis.com:SearchTextRequestPerDayPerProject', 0],
    ['geocoding-backend.googleapis.com:V4GeocodeLocationPerDayPerProject', 300],
    ['recaptchaenterprise.googleapis.com:CreateAssessmentRequestsPerDayPerProject', 300],
    ['identitytoolkit.googleapis.com:defaultPerMinutePerProject', 60],
    ['identitytoolkit.googleapis.com:signInWithCustomTokenPerMinutePerProject', 0],
    ['identitytoolkit.googleapis.com:sendVerificationCodePerDayPerProject', 0],
  ]);
  for (const [id, value] of required) {
    const quota = plan.quotas.find((entry) => `${entry.service}:${entry.quotaId}` === id);
    if (quota?.preferredValue !== value) throw new Error(`Reviewed safety value drifted: ${id}`);
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

function defaultCommandRunner(args) {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gcloud failed (${result.status}): ${String(result.stderr || result.stdout).trim()}`);
  }
  const output = String(result.stdout || '').trim();
  return output ? JSON.parse(output) : {};
}

function preferenceIdFor(service, quotaId) {
  return `planli-${sha256(`${service}:${quotaId}`).slice(0, 24)}`;
}

function quotaValue(info) {
  const dimensions = info?.dimensionsInfos || [];
  const values = dimensions.flatMap((entry) => Array.isArray(entry?.details)
    ? entry.details
    : (entry?.details && typeof entry.details === 'object' ? [entry.details] : []))
    .map((entry) => String(entry?.value ?? ''))
    .filter(Boolean);
  // Cloud Quotas uses proto3 JSON. A granted numeric zero is omitted and is
  // returned as an empty details object for the single global dimension.
  if (!values.length && dimensions.length === 1) return '0';
  if (values.length !== 1) throw new Error(`Quota must have one global value: ${info?.quotaId || '<unknown>'}`);
  return values[0];
}

function buildActions(plan, preferences, quotaInfosByService) {
  const actions = [];
  for (const quota of plan.quotas) {
    const matches = preferences.filter((entry) =>
      entry.service === quota.service && entry.quotaId === quota.quotaId);
    if (matches.length > 1) throw new Error(`Multiple quota preferences exist for ${quota.quotaId}.`);
    const info = (quotaInfosByService.get(quota.service) || [])
      .find((entry) => entry.quotaId === quota.quotaId);
    if (!info) throw new Error(`Quota is unavailable for ${quota.service}:${quota.quotaId}.`);
    const currentValue = quotaValue(info);
    const preferredValue = String(quota.preferredValue);
    const preference = matches[0] || null;
    const preferenceValue = String(preference?.quotaConfig?.preferredValue ??
      preference?.quotaConfig?.grantedValue ?? '');
    actions.push({
      service: quota.service,
      quotaId: quota.quotaId,
      purpose: quota.purpose,
      currentValue,
      preferredValue,
      preferenceId: preference?.name?.split('/').pop() || preferenceIdFor(quota.service, quota.quotaId),
      action: currentValue === preferredValue && preferenceValue === preferredValue
        ? 'reuse-quota-preference'
        : (preference ? 'update-quota-preference' : 'create-quota-preference'),
    });
  }
  return actions;
}

function readState(plan, commandRunner) {
  const preferences = commandRunner([
    'quotas', 'preferences', 'list', `--project=${plan.projectId}`, '--format=json',
  ]);
  const quotaInfosByService = new Map();
  for (const service of [...new Set(plan.quotas.map((entry) => entry.service))]) {
    quotaInfosByService.set(service, commandRunner([
      'quotas', 'info', 'list', `--service=${service}`, `--project=${plan.projectId}`, '--format=json',
    ]));
  }
  return { preferences, quotaInfosByService };
}

function applyAction(plan, action, commandRunner) {
  commandRunner([
    'quotas', 'preferences', 'update', action.preferenceId,
    `--service=${action.service}`,
    `--project=${plan.projectId}`,
    `--quota-id=${action.quotaId}`,
    `--preferred-value=${action.preferredValue}`,
    '--allow-missing',
    '--allow-high-percentage-quota-decrease',
    '--allow-quota-decrease-below-usage',
    '--quiet',
    '--format=json',
  ]);
}

function execute(options = {}) {
  const plan = loadPlan(options.configPath || CONFIG_PATH);
  const hash = manifestHash(plan);
  assertApplyGates(options, hash);
  const commandRunner = options.commandRunner || defaultCommandRunner;
  let state = readState(plan, commandRunner);
  let actions = buildActions(plan, state.preferences, state.quotaInfosByService);
  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: plan.projectId,
    manifestSha256: hash,
    actions,
  };
  if (!options.apply) return result;
  for (const action of actions.filter((entry) => entry.action !== 'reuse-quota-preference')) {
    applyAction(plan, action, commandRunner);
  }
  state = readState(plan, commandRunner);
  actions = buildActions(plan, state.preferences, state.quotaInfosByService);
  const pending = actions.filter((entry) => entry.action !== 'reuse-quota-preference');
  if (pending.length) {
    throw new Error(`Quota read-back did not reach the reviewed values: ${pending.map((entry) => entry.quotaId).join(', ')}`);
  }
  return { ...result, actions, readBackVerified: true };
}

if (require.main === module) {
  try {
    const result = execute(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === 'dry-run') {
      process.stdout.write(`No production state changed. Apply additionally requires --manifest-hash and --confirm "${CONFIRMATION}".\n`);
    }
  } catch (error) {
    process.stderr.write(`Security cost-quota plan failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  CONFIRMATION,
  assertApplyGates,
  buildActions,
  loadPlan,
  manifestHash,
  parseArgs,
  preferenceIdFor,
  quotaValue,
  validatePlan,
};
