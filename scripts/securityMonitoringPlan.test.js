const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CONFIRMATION,
  assertApplyGates,
  buildActions,
  loadPlan,
  manifestHash,
  parseArgs,
  policyBody,
} = require('./securityMonitoringPlan');

test('reviewed monitoring manifest has four unique controls and keeps App Check dormant', () => {
  const plan = loadPlan();
  assert.equal(plan.policies.length, 4);
  assert.equal(new Set(plan.policies.map((policy) =>
    policy.userLabels.planli_control)).size, 4);
  assert.equal(plan.policies.find((policy) =>
    policy.userLabels.planli_control === 'app-check-rejected').enabled, false);
  assert.match(plan.policies.find((policy) =>
    policy.userLabels.planli_control === 'location-provider-429')
    .conditions[0].conditionMatchedLog.filter, /jsonPayload\.providerStatus=429/);
});

test('apply requires the exact project, manifest and typed confirmation', () => {
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

test('dry-run action builder refuses drift and never mutates existing controls', () => {
  const plan = loadPlan();
  assert.equal(buildActions(plan, [], []).actions.filter((entry) =>
    entry.action === 'create-policy').length, 4);
  const channel = { ...plan.channel, name: 'projects/planli-f0b12/notificationChannels/one' };
  const policies = plan.policies.map((policy, index) => ({
    ...policyBody(policy, channel.name),
    name: `projects/planli-f0b12/alertPolicies/${index + 1}`,
    conditions: policy.conditions.map((condition, conditionIndex) => ({
      ...condition,
      name: `projects/planli-f0b12/alertPolicies/${index + 1}/conditions/${conditionIndex + 1}`,
    })),
  }));
  assert(buildActions(plan, [channel], policies).actions.every((entry) =>
    entry.action.startsWith('reuse-')));
  assert.throws(() => buildActions(plan, [channel], [{
    ...policies[0], enabled: !policies[0].enabled,
  }]), /differs/);
});

test('argument parser rejects alternate projects and unknown options', () => {
  assert.throws(() => parseArgs(['--project', 'other']), /Refusing/);
  assert.throws(() => parseArgs(['--force']), /Unknown/);
});
