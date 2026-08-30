const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CONFIRMATION,
  actionsFor,
  assertApplyGates,
  loadPlan,
  manifestHash,
  parseArgs,
} = require('./securityProductionPrerequisites');

test('production prerequisite manifest is exact and bounded', () => {
  const plan = loadPlan();
  assert.equal(plan.projectId, 'planli-f0b12');
  assert.equal(plan.services.length, 5);
  assert.ok(plan.services.includes('geocoding-backend.googleapis.com'));
  assert.ok(!plan.services.includes('geocode.googleapis.com'));
  assert.equal(plan.iosApp.teamId, 'C22ZFVA6M6');
  assert.equal(plan.serviceUsageGrant.role, 'roles/serviceusage.serviceUsageConsumer');
  assert.equal(plan.appCheckVerifierGrant.role, 'roles/firebaseappcheck.tokenVerifier');
  assert.equal(plan.mediaAppCheckVerifierGrant.role, 'roles/firebaseappcheck.tokenVerifier');
});

test('apply requires exact project, manifest and typed confirmation', () => {
  const hash = manifestHash(loadPlan());
  assert.throws(() => assertApplyGates({ apply: true }, hash), /project/);
  assert.throws(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: 'wrong', confirm: CONFIRMATION,
  }, hash), /hash/);
  assert.throws(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: hash, confirm: 'yes',
  }, hash), /confirmation/);
  assert.doesNotThrow(() => assertApplyGates({
    apply: true, project: 'planli-f0b12', manifestHash: hash, confirm: CONFIRMATION,
  }, hash));
});

test('dry-run actions describe only missing services, three least-privilege IAM grants and one Team ID patch', () => {
  const plan = loadPlan();
  const actions = actionsFor(plan, {
    missingServices: [plan.services[0]],
    serviceUsageGranted: false,
    appCheckVerifierGranted: false,
    mediaAppCheckVerifierGranted: false,
    teamIdMatches: false,
  });
  assert.equal(actions.filter((entry) => entry.action === 'enable-service').length, 1);
  assert.equal(actions.filter((entry) => entry.action === 'add-iam-grant').length, 3);
  assert.equal(actions.filter((entry) => entry.action === 'patch-team-id').length, 1);
});

test('argument parser rejects alternate projects and unknown options', () => {
  assert.throws(() => parseArgs(['--project', 'other']), /Refusing/);
  assert.throws(() => parseArgs(['--force']), /Unknown/);
});
