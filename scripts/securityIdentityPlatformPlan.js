#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { gcloudAccessToken } = require('../functions/scripts/localCredentials');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'security-identity-platform.json');
const PRODUCTION_PROJECT = 'planli-f0b12';
const CONFIRMATION = 'ACCEPT IDENTITY PLATFORM TERMS AND ENABLE PLANLI TOTP';

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
      plan.desiredSubtype !== 'IDENTITY_PLATFORM') {
    throw new Error('Invalid production Identity Platform manifest.');
  }
  const expectedMfa = {
    state: 'ENABLED',
    enabledProviders: [],
    providerConfigs: [{
      state: 'ENABLED',
      totpProviderConfig: { adjacentIntervals: 1 },
    }],
  };
  if (JSON.stringify(plan.mfa) !== JSON.stringify(expectedMfa)) {
    throw new Error('Identity Platform manifest must enable TOTP only with one adjacent interval.');
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

async function requestJson(url, { method = 'GET', accessToken, projectId, body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Goog-User-Project': projectId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new Error(`Identity Platform ${method} request failed with HTTP ${response.status}.`);
  }
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function summarizeState(config) {
  const providers = Array.isArray(config?.mfa?.providerConfigs) ? config.mfa.providerConfigs : [];
  const totp = providers.find((provider) => provider?.totpProviderConfig);
  const enabledProviders = Array.isArray(config?.mfa?.enabledProviders)
    ? config.mfa.enabledProviders
    : [];
  return {
    subtype: config?.subtype || 'UNKNOWN',
    mfaState: config?.mfa?.state || 'UNKNOWN',
    totpEnabled: totp?.state === 'ENABLED',
    adjacentIntervals: Number(totp?.totpProviderConfig?.adjacentIntervals ?? -1),
    smsEnabled: enabledProviders.includes('PHONE_SMS'),
  };
}

function stateMatchesPlan(state, plan) {
  return state.subtype === plan.desiredSubtype &&
    state.mfaState === 'ENABLED' &&
    state.totpEnabled &&
    state.adjacentIntervals === plan.mfa.providerConfigs[0].totpProviderConfig.adjacentIntervals &&
    !state.smsEnabled;
}

function actionsFor(state, plan) {
  return [
    {
      control: 'identity-platform',
      action: state.subtype === plan.desiredSubtype ? 'reuse-initialized-platform' : 'initialize-identity-platform',
      currentSubtype: state.subtype,
    },
    {
      control: 'totp-mfa-only',
      action: state.mfaState === 'ENABLED' && state.totpEnabled &&
        state.adjacentIntervals === 1 && !state.smsEnabled
        ? 'reuse-totp-configuration'
        : 'enable-totp-and-disable-sms-mfa',
      currentMfaState: state.mfaState,
      currentTotpEnabled: state.totpEnabled,
      currentSmsEnabled: state.smsEnabled,
    },
  ];
}

async function readState(plan, dependencies = {}) {
  const accessToken = (dependencies.tokenProvider || gcloudAccessToken)().access_token;
  const config = await requestJson(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${plan.projectId}/config`,
    { accessToken, projectId: plan.projectId, fetchImpl: dependencies.fetchImpl },
  );
  return { accessToken, state: summarizeState(config) };
}

async function initializeIdentityPlatform(plan, accessToken, fetchImpl) {
  return requestJson(
    `https://identitytoolkit.googleapis.com/v2/projects/${plan.projectId}/identityPlatform:initializeAuth`,
    { method: 'POST', accessToken, projectId: plan.projectId, fetchImpl },
  );
}

async function patchTotp(plan, accessToken, fetchImpl) {
  return requestJson(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${plan.projectId}/config?updateMask=mfa`,
    {
      method: 'PATCH',
      accessToken,
      projectId: plan.projectId,
      body: { mfa: plan.mfa },
      fetchImpl,
    },
  );
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
    actions: actionsFor(before.state, plan),
  };
  if (!options.apply) return result;
  if (before.state.subtype !== plan.desiredSubtype) {
    await (dependencies.initializeIdentityPlatform || initializeIdentityPlatform)(
      plan, before.accessToken, dependencies.fetchImpl,
    );
  }
  if (!stateMatchesPlan(before.state, plan)) {
    await (dependencies.patchTotp || patchTotp)(plan, before.accessToken, dependencies.fetchImpl);
  }
  const after = await readState(plan, dependencies);
  if (!stateMatchesPlan(after.state, plan)) {
    throw new Error('Identity Platform/TOTP read-back did not match the exact manifest.');
  }
  return { ...result, readBackVerified: true };
}

if (require.main === module) {
  execute(parseArgs(process.argv.slice(2))).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === 'dry-run') {
      process.stdout.write(
        `No production state changed. Apply additionally requires --manifest-hash and --confirm "${CONFIRMATION}".\n`,
      );
    }
  }).catch((error) => {
    process.stderr.write(`Identity Platform security plan failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  actionsFor,
  assertApplyGates,
  execute,
  loadPlan,
  manifestHash,
  parseArgs,
  stateMatchesPlan,
  summarizeState,
  validatePlan,
};
