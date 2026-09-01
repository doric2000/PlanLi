#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gcloudAccessToken } = require('../functions/scripts/localCredentials');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'security-app-check-providers.json');
const PRODUCTION_PROJECT = 'planli-f0b12';
const REQUIRED_SERVICES = Object.freeze([
  'firebaseappcheck.googleapis.com',
  'playintegrity.googleapis.com',
  'recaptchaenterprise.googleapis.com',
]);
const CONFIRMATION = 'REGISTER PLANLI PRODUCTION APP CHECK PROVIDERS WITHOUT ENFORCEMENT';
const PARTIAL_CONFIRMATION =
  'REGISTER PLANLI PRODUCTION APP CHECK PROVIDERS EXCEPT DEVICECHECK WITHOUT ENFORCEMENT';

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
      plan.projectNumber !== '633543026638' || plan.tokenTtl !== '3600s') {
    throw new Error('Invalid production App Check manifest.');
  }
  if (plan.android?.appId !== '1:633543026638:android:4f0dc56759f6923b46ad9f' ||
      plan.android?.packageName !== 'com.planli.planlitravels' ||
      JSON.stringify(plan.android?.sha256Certificates) !== JSON.stringify([
        'bac97a1a563bbcf55137c31e32f294b4a267b87bcce2f68b7d1f04141e2c195d',
        'd8a890c5d94d922ccbf45dd7c9fe30af358a729b7bf2eabd3f66d96d99618d35',
      ]) ||
      JSON.stringify(plan.android?.playIntegrity) !== JSON.stringify({
        allowUnrecognizedVersion: false,
        requireLicensed: true,
        minDeviceRecognitionLevel: 'NO_INTEGRITY',
      })) {
    throw new Error('Android App Check identity or policy differs from the reviewed scope.');
  }
  if (plan.ios?.appId !== '1:633543026638:ios:b13b28c424e4c9e846ad9f' ||
      plan.ios?.bundleId !== 'com.planli.planlitravels' || plan.ios?.teamId !== 'C22ZFVA6M6' ||
      plan.ios?.requireDeviceCheckFallback !== true) {
    throw new Error('iOS App Check identity or fallback policy differs from the reviewed scope.');
  }
  if (plan.web?.appId !== '1:633543026638:web:b63d2a622f3d685646ad9f' ||
      plan.web?.recaptchaDisplayName !== 'PlanLi Web App Check' ||
      JSON.stringify(plan.web?.allowedDomains) !== JSON.stringify([
        'planli.cc', 'planli-f0b12.firebaseapp.com', 'planli-f0b12.web.app',
      ]) || plan.web?.minValidScore !== 0.5) {
    throw new Error('Web App Check identity or domain policy differs from the reviewed scope.');
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
  const options = {
    apply: false, project: '', manifestHash: '', confirm: '',
    devicecheckKeyId: '', devicecheckPrivateKeyFile: '', withoutDevicecheck: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--apply') options.apply = true;
    else if (key === '--without-devicecheck') options.withoutDevicecheck = true;
    else if ([
      '--project', '--manifest-hash', '--confirm', '--devicecheck-key-id',
      '--devicecheck-private-key-file',
    ].includes(key)) {
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

function loadDeviceCheckCredential(options) {
  if (!/^[A-Z0-9]{10}$/.test(options.devicecheckKeyId || '')) {
    throw new Error('Apply requires a 10-character Apple DeviceCheck --devicecheck-key-id.');
  }
  if (!options.devicecheckPrivateKeyFile) {
    throw new Error('Apply requires --devicecheck-private-key-file.');
  }
  const resolved = path.resolve(options.devicecheckPrivateKeyFile);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('The DeviceCheck private key must remain outside the repository.');
  }
  const privateKey = fs.readFileSync(resolved, 'utf8').trim();
  if (privateKey.length > 20_000 ||
      !/^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----$/u.test(privateKey)) {
    throw new Error('The DeviceCheck private key file is not a valid bounded PKCS#8 PEM.');
  }
  return { keyId: options.devicecheckKeyId, privateKey };
}

function assertApplyGates(options, hash) {
  if (!options.apply) {
    if (options.withoutDevicecheck) throw new Error('--without-devicecheck requires --apply.');
    return null;
  }
  if (options.project !== PRODUCTION_PROJECT) throw new Error('Apply requires --project planli-f0b12.');
  if (options.manifestHash !== hash) throw new Error('Apply manifest hash mismatch.');
  const expectedConfirmation = options.withoutDevicecheck ? PARTIAL_CONFIRMATION : CONFIRMATION;
  if (options.confirm !== expectedConfirmation) throw new Error('Apply typed confirmation mismatch.');
  if (options.withoutDevicecheck) return null;
  return loadDeviceCheckCredential(options);
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

async function requestJson(url, {
  method = 'GET', accessToken, projectId, body, allowMissing = false, fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Goog-User-Project': projectId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`App Check ${method} request failed with HTTP ${response.status}.`);
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function firebaseAppInventory(plan, accessToken, fetchImpl) {
  const headers = { accessToken, projectId: plan.projectId, fetchImpl };
  const base = `https://firebase.googleapis.com/v1beta1/projects/${plan.projectId}`;
  const [android, ios, web, sha] = await Promise.all([
    requestJson(`${base}/androidApps/${plan.android.appId}`, headers),
    requestJson(`${base}/iosApps/${plan.ios.appId}`, headers),
    requestJson(`${base}/webApps/${plan.web.appId}`, headers),
    requestJson(`${base}/androidApps/${plan.android.appId}/sha`, headers),
  ]);
  const sha256Certificates = (sha.certificates || [])
    .filter((certificate) => certificate.certType === 'SHA_256')
    .map((certificate) => String(certificate.shaHash || '').toLowerCase())
    .sort();
  const identityMatches = android.packageName === plan.android.packageName &&
    ios.bundleId === plan.ios.bundleId && ios.teamId === plan.ios.teamId &&
    android.state === 'ACTIVE' && ios.state === 'ACTIVE' && web.state === 'ACTIVE';
  return {
    identityMatches,
    sha256Matches: JSON.stringify(sha256Certificates) === JSON.stringify(plan.android.sha256Certificates),
  };
}

function appCheckResource(plan, appId, suffix) {
  return `projects/${plan.projectNumber}/apps/${appId}/${suffix}`;
}

function playIntegrityBody(plan) {
  const name = appCheckResource(plan, plan.android.appId, 'playIntegrityConfig');
  return {
    name,
    tokenTtl: plan.tokenTtl,
    appIntegrity: { allowUnrecognizedVersion: false },
    deviceIntegrity: { minDeviceRecognitionLevel: 'NO_INTEGRITY' },
    accountDetails: { requireLicensed: true },
  };
}

function appAttestBody(plan) {
  return {
    name: appCheckResource(plan, plan.ios.appId, 'appAttestConfig'),
    tokenTtl: plan.tokenTtl,
  };
}

function deviceCheckBody(plan, credential) {
  return {
    name: appCheckResource(plan, plan.ios.appId, 'deviceCheckConfig'),
    tokenTtl: plan.tokenTtl,
    keyId: credential.keyId,
    privateKey: credential.privateKey,
  };
}

function recaptchaKeyBody(plan) {
  return {
    displayName: plan.web.recaptchaDisplayName,
    webSettings: {
      allowAllDomains: false,
      allowedDomains: plan.web.allowedDomains,
      allowAmpTraffic: false,
      integrationType: 'SCORE',
    },
  };
}

function recaptchaAppCheckBody(plan, siteKey) {
  return {
    name: appCheckResource(plan, plan.web.appId, 'recaptchaEnterpriseConfig'),
    tokenTtl: plan.tokenTtl,
    siteKey,
    riskAnalysis: { minValidScore: plan.web.minValidScore },
  };
}

function configMatches(actual, expected, fields) {
  if (!actual) return false;
  return fields.every((field) => JSON.stringify(stable(actual[field])) === JSON.stringify(stable(expected[field])));
}

function playIntegrityMatches(actual, plan) {
  if (!actual) return false;
  const allowUnrecognizedVersion = actual.appIntegrity?.allowUnrecognizedVersion === true;
  const minDeviceRecognitionLevel =
    actual.deviceIntegrity?.minDeviceRecognitionLevel || 'NO_INTEGRITY';
  return actual.tokenTtl === plan.tokenTtl &&
    allowUnrecognizedVersion === plan.android.playIntegrity.allowUnrecognizedVersion &&
    minDeviceRecognitionLevel === plan.android.playIntegrity.minDeviceRecognitionLevel &&
    actual.accountDetails?.requireLicensed === plan.android.playIntegrity.requireLicensed;
}

function recaptchaKeyMatches(key, plan) {
  if (!key || key.displayName !== plan.web.recaptchaDisplayName) return false;
  const settings = key.webSettings || {};
  return settings.allowAllDomains === false && settings.allowAmpTraffic === false &&
    settings.integrationType === 'SCORE' &&
    JSON.stringify([...(settings.allowedDomains || [])].sort()) ===
      JSON.stringify([...plan.web.allowedDomains].sort());
}

async function listRecaptchaKeys(plan, accessToken, fetchImpl) {
  const keys = [];
  let pageToken = '';
  do {
    const url = new URL(`https://recaptchaenterprise.googleapis.com/v1/projects/${plan.projectId}/keys`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const result = await requestJson(url, {
      accessToken, projectId: plan.projectId, fetchImpl,
    });
    keys.push(...(result.keys || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return keys;
}

async function appCheckConfig(plan, appId, suffix, accessToken, fetchImpl) {
  const name = appCheckResource(plan, appId, suffix);
  return requestJson(`https://firebaseappcheck.googleapis.com/v1beta/${name}`, {
    accessToken, projectId: plan.projectId, allowMissing: true, fetchImpl,
  });
}

async function enforcementHash(plan, accessToken, fetchImpl) {
  const result = await requestJson(
    `https://firebaseappcheck.googleapis.com/v1beta/projects/${plan.projectNumber}/services?pageSize=100`,
    { accessToken, projectId: plan.projectId, fetchImpl },
  );
  return sha256(JSON.stringify(stable(result.services || [])));
}

async function readState(plan, dependencies = {}) {
  const gcloud = dependencies.gcloud || runGcloud;
  const rows = JSON.parse(gcloud([
    'services', 'list', '--enabled', '--project', plan.projectId, '--format=json(config.name)', '--quiet',
  ]) || '[]');
  const enabled = new Set(rows.map((row) => row.config?.name).filter(Boolean));
  const missingServices = REQUIRED_SERVICES.filter((service) => !enabled.has(service));
  const accessToken = (dependencies.tokenProvider || gcloudAccessToken)().access_token;
  const apps = await (dependencies.firebaseAppInventory || firebaseAppInventory)(
    plan, accessToken, dependencies.fetchImpl,
  );
  if (missingServices.length) {
    return { accessToken, missingServices, apps, providerState: null };
  }
  const [play, appAttest, deviceCheck, recaptchaConfig, keys, serviceHash] = await Promise.all([
    appCheckConfig(plan, plan.android.appId, 'playIntegrityConfig', accessToken, dependencies.fetchImpl),
    appCheckConfig(plan, plan.ios.appId, 'appAttestConfig', accessToken, dependencies.fetchImpl),
    appCheckConfig(plan, plan.ios.appId, 'deviceCheckConfig', accessToken, dependencies.fetchImpl),
    appCheckConfig(plan, plan.web.appId, 'recaptchaEnterpriseConfig', accessToken, dependencies.fetchImpl),
    listRecaptchaKeys(plan, accessToken, dependencies.fetchImpl),
    enforcementHash(plan, accessToken, dependencies.fetchImpl),
  ]);
  const matchingKeys = keys.filter((key) => key.displayName === plan.web.recaptchaDisplayName);
  if (matchingKeys.length > 1) throw new Error('Multiple reCAPTCHA keys use the reviewed display name.');
  const recaptchaKey = matchingKeys[0] || null;
  if (recaptchaKey && !recaptchaKeyMatches(recaptchaKey, plan)) {
    throw new Error('The existing PlanLi reCAPTCHA key conflicts with the reviewed domain policy.');
  }
  const siteKey = recaptchaKey?.name?.split('/').pop() || '';
  return {
    accessToken,
    missingServices,
    apps,
    providerState: {
      playMatches: playIntegrityMatches(play, plan),
      appAttestMatches: configMatches(appAttest, appAttestBody(plan), ['tokenTtl']),
      deviceCheckMatches: Boolean(deviceCheck?.privateKeySet && deviceCheck?.keyId &&
        deviceCheck?.tokenTtl === plan.tokenTtl),
      recaptchaKeyMatches: Boolean(recaptchaKey),
      recaptchaConfigMatches: Boolean(siteKey && configMatches(
        recaptchaConfig, recaptchaAppCheckBody(plan, siteKey), ['tokenTtl', 'siteKey', 'riskAnalysis'],
      )),
      siteKey,
      enforcementHash: serviceHash,
    },
  };
}

function actionsFor(state) {
  const actions = [
    ...state.missingServices.map((service) => ({ control: service, action: 'blocked-enable-prerequisite' })),
    { control: 'firebase-app-identities', action: state.apps.identityMatches ? 'verified' : 'block-identity-mismatch' },
    { control: 'android-sha256-certificates', action: state.apps.sha256Matches ? 'verified' : 'block-certificate-mismatch' },
  ];
  if (!state.providerState) return actions;
  const checks = [
    ['play-integrity', 'playMatches'],
    ['app-attest', 'appAttestMatches'],
    ['device-check-fallback', 'deviceCheckMatches'],
    ['recaptcha-enterprise-key', 'recaptchaKeyMatches'],
    ['recaptcha-enterprise-app-check', 'recaptchaConfigMatches'],
  ];
  return actions.concat(checks.map(([control, field]) => ({
    control,
    action: state.providerState[field] ? 'reuse-exact-config' : 'create-or-update-exact-config',
  })));
}

async function patchConfig(plan, accessToken, body, updateMask, fetchImpl) {
  const url = new URL(`https://firebaseappcheck.googleapis.com/v1beta/${body.name}`);
  url.searchParams.set('updateMask', updateMask);
  return requestJson(url, {
    method: 'PATCH', accessToken, projectId: plan.projectId, body, fetchImpl,
  });
}

async function createRecaptchaKey(plan, accessToken, fetchImpl) {
  return requestJson(
    `https://recaptchaenterprise.googleapis.com/v1/projects/${plan.projectId}/keys`,
    {
      method: 'POST', accessToken, projectId: plan.projectId,
      body: recaptchaKeyBody(plan), fetchImpl,
    },
  );
}

async function execute(options = {}) {
  const plan = loadPlan(options.configPath || CONFIG_PATH);
  const hash = manifestHash(plan);
  const credential = assertApplyGates(options, hash);
  const dependencies = options.dependencies || {};
  const before = await readState(plan, dependencies);
  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    projectId: plan.projectId,
    manifestSha256: hash,
    actions: actionsFor(before),
    enforcementChanged: false,
  };
  if (!options.apply) return result;
  if (before.missingServices.length) {
    throw new Error(`App Check apply is blocked by disabled services: ${before.missingServices.join(', ')}.`);
  }
  if (!before.apps.identityMatches || !before.apps.sha256Matches) {
    throw new Error('Firebase app identity or Android SHA-256 inventory does not match the manifest.');
  }
  const fetchImpl = dependencies.fetchImpl;
  const token = before.accessToken;
  const provider = before.providerState;
  if (!provider.playMatches) await patchConfig(
    plan, token, playIntegrityBody(plan),
    'tokenTtl,appIntegrity,deviceIntegrity,accountDetails', fetchImpl,
  );
  if (!provider.appAttestMatches) await patchConfig(
    plan, token, appAttestBody(plan), 'tokenTtl', fetchImpl,
  );
  if (!provider.deviceCheckMatches && credential) await patchConfig(
    plan, token, deviceCheckBody(plan, credential), 'tokenTtl,keyId,privateKey', fetchImpl,
  );
  let siteKey = provider.siteKey;
  if (!provider.recaptchaKeyMatches) {
    const created = await createRecaptchaKey(plan, token, fetchImpl);
    siteKey = String(created.name || '').split('/').pop();
    if (!siteKey) throw new Error('reCAPTCHA key creation returned no key identifier.');
  }
  if (!provider.recaptchaConfigMatches) await patchConfig(
    plan, token, recaptchaAppCheckBody(plan, siteKey), 'tokenTtl,siteKey,riskAnalysis', fetchImpl,
  );
  const after = await readState(plan, dependencies);
  const controls = after.providerState;
  if (!after.apps.identityMatches || !after.apps.sha256Matches ||
      !controls || !controls.playMatches || !controls.appAttestMatches ||
      (!options.withoutDevicecheck && !controls.deviceCheckMatches) || !controls.recaptchaKeyMatches ||
      !controls.recaptchaConfigMatches) {
    throw new Error('App Check provider read-back did not match the manifest.');
  }
  if (controls.enforcementHash !== provider.enforcementHash) {
    throw new Error('App Check service enforcement changed unexpectedly.');
  }
  return {
    ...result,
    readBackVerified: true,
    partial: options.withoutDevicecheck && !controls.deviceCheckMatches,
    remainingControls: options.withoutDevicecheck && !controls.deviceCheckMatches
      ? ['device-check-fallback']
      : [],
    recaptchaSiteKey: controls.siteKey,
  };
}

if (require.main === module) {
  execute(parseArgs(process.argv.slice(2))).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === 'dry-run') {
      process.stdout.write(
        `No production state changed. Full apply requires an Apple DeviceCheck key file outside the repository and --confirm "${CONFIRMATION}". A guarded partial apply may use --without-devicecheck and --confirm "${PARTIAL_CONFIRMATION}" without changing enforcement.\n`,
      );
    }
  }).catch((error) => {
    process.stderr.write(`App Check provider plan failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  PARTIAL_CONFIRMATION,
  REQUIRED_SERVICES,
  actionsFor,
  appAttestBody,
  assertApplyGates,
  deviceCheckBody,
  execute,
  loadDeviceCheckCredential,
  loadPlan,
  manifestHash,
  parseArgs,
  playIntegrityBody,
  playIntegrityMatches,
  recaptchaAppCheckBody,
  recaptchaKeyBody,
  recaptchaKeyMatches,
  validatePlan,
};
