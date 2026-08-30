const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CONFIRMATION,
  PARTIAL_CONFIRMATION,
  REQUIRED_SERVICES,
  actionsFor,
  appAttestBody,
  assertApplyGates,
  deviceCheckBody,
  loadDeviceCheckCredential,
  loadPlan,
  manifestHash,
  parseArgs,
  playIntegrityBody,
  playIntegrityMatches,
  recaptchaAppCheckBody,
  recaptchaKeyBody,
  recaptchaKeyMatches,
} = require('./securityAppCheckProviders');

test('App Check manifest pins exact apps, certificates, domains and secure provider defaults', () => {
  const plan = loadPlan();
  assert.equal(plan.projectId, 'planli-f0b12');
  assert.equal(plan.android.sha256Certificates.length, 2);
  assert.equal(plan.android.playIntegrity.allowUnrecognizedVersion, false);
  assert.equal(plan.android.playIntegrity.requireLicensed, true);
  assert.equal(plan.android.playIntegrity.minDeviceRecognitionLevel, 'NO_INTEGRITY');
  assert.equal(plan.ios.requireDeviceCheckFallback, true);
  assert.deepEqual(plan.web.allowedDomains, [
    'planli-f0b12.firebaseapp.com', 'planli-f0b12.web.app',
  ]);
});

test('provider payloads contain exact reviewed controls and no enforcement mutation', () => {
  const plan = loadPlan();
  assert.deepEqual(playIntegrityBody(plan).accountDetails, { requireLicensed: true });
  assert.deepEqual(playIntegrityBody(plan).deviceIntegrity, { minDeviceRecognitionLevel: 'NO_INTEGRITY' });
  assert.equal(appAttestBody(plan).tokenTtl, '3600s');
  assert.deepEqual(recaptchaKeyBody(plan).webSettings.allowedDomains, plan.web.allowedDomains);
  assert.equal(recaptchaKeyBody(plan).webSettings.integrationType, 'SCORE');
  assert.equal(recaptchaAppCheckBody(plan, 'site-key').riskAnalysis.minValidScore, 0.5);
  for (const body of [playIntegrityBody(plan), appAttestBody(plan), recaptchaAppCheckBody(plan, 'site-key')]) {
    assert.equal(Object.hasOwn(body, 'enforcementMode'), false);
  }
});

test('Play Integrity read-back accepts omitted secure defaults but rejects a widened app policy', () => {
  const plan = loadPlan();
  const normalizedByGoogle = {
    tokenTtl: '3600s',
    appIntegrity: {},
    deviceIntegrity: { minDeviceRecognitionLevel: 'NO_INTEGRITY' },
    accountDetails: { requireLicensed: true },
  };
  assert.equal(playIntegrityMatches(normalizedByGoogle, plan), true);
  assert.equal(playIntegrityMatches({
    ...normalizedByGoogle,
    appIntegrity: { allowUnrecognizedVersion: true },
  }, plan), false);
  assert.equal(playIntegrityMatches({
    ...normalizedByGoogle,
    accountDetails: { requireLicensed: false },
  }, plan), false);
});

test('dry-run actions expose disabled prerequisites without pretending providers were read', () => {
  const actions = actionsFor({
    missingServices: [...REQUIRED_SERVICES],
    apps: { identityMatches: true, sha256Matches: true },
    providerState: null,
  });
  assert.equal(actions.filter((action) => action.action === 'blocked-enable-prerequisite').length, 3);
  assert.equal(actions.some((action) => action.control === 'play-integrity'), false);
});

test('reCAPTCHA key matching is exact and rejects widened domains', () => {
  const plan = loadPlan();
  const exact = {
    displayName: plan.web.recaptchaDisplayName,
    webSettings: {
      allowAllDomains: false,
      allowedDomains: [...plan.web.allowedDomains].reverse(),
      allowAmpTraffic: false,
      integrationType: 'SCORE',
    },
  };
  assert.equal(recaptchaKeyMatches(exact, plan), true);
  assert.equal(recaptchaKeyMatches({
    ...exact, webSettings: { ...exact.webSettings, allowAllDomains: true },
  }, plan), false);
  assert.equal(recaptchaKeyMatches({
    ...exact, webSettings: { ...exact.webSettings, allowedDomains: [...plan.web.allowedDomains, 'example.com'] },
  }, plan), false);
});

test('apply gates require exact production scope and an external bounded DeviceCheck key', () => {
  const plan = loadPlan();
  const hash = manifestHash(plan);
  assert.throws(() => assertApplyGates({ apply: true }, hash), /project/);
  assert.throws(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: 'wrong', confirm: CONFIRMATION,
  }, hash), /hash/);
  assert.throws(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: hash, confirm: CONFIRMATION,
  }, hash), /key-id/);
  assert.throws(() => assertApplyGates({
    apply: true, withoutDevicecheck: true, project: 'planli-f0b12',
    manifestHash: hash, confirm: CONFIRMATION,
  }, hash), /confirmation/);
  assert.equal(assertApplyGates({
    apply: true, withoutDevicecheck: true, project: 'planli-f0b12',
    manifestHash: hash, confirm: PARTIAL_CONFIRMATION,
  }, hash), null);
  assert.throws(() => assertApplyGates({ withoutDevicecheck: true }, hash), /requires --apply/);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-devicecheck-test-'));
  const keyPath = path.join(temp, 'AuthKey_TEST.p8');
  fs.writeFileSync(keyPath, '-----BEGIN PRIVATE KEY-----\nQUJDRA==\n-----END PRIVATE KEY-----\n', { mode: 0o600 });
  try {
    const credential = loadDeviceCheckCredential({
      devicecheckKeyId: 'ABC123DEF4', devicecheckPrivateKeyFile: keyPath,
    });
    assert.equal(credential.keyId, 'ABC123DEF4');
    assert.match(credential.privateKey, /BEGIN PRIVATE KEY/);
    assert.equal(deviceCheckBody(plan, credential).privateKey, credential.privateKey);
  } finally {
    fs.unlinkSync(keyPath);
    fs.rmdirSync(temp);
  }
});

test('argument parser rejects alternate projects, unknown options and accepts device inputs', () => {
  assert.throws(() => parseArgs(['--project', 'other']), /Refusing/);
  assert.throws(() => parseArgs(['--force']), /Unknown/);
  const parsed = parseArgs([
    '--project', 'planli-f0b12', '--devicecheck-key-id', 'ABC123DEF4',
    '--devicecheck-private-key-file', 'C:/outside/key.p8',
  ]);
  assert.equal(parsed.devicecheckKeyId, 'ABC123DEF4');
  assert.equal(parsed.devicecheckPrivateKeyFile, 'C:/outside/key.p8');
  assert.equal(parseArgs(['--without-devicecheck']).withoutDevicecheck, true);
});
