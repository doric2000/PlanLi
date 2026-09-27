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
  appCheckRolloutPlan,
  monitoringStateHash,
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

test('rollout alert scopes only enforced active callables and includes explicit replays', () => {
  const plan = appCheckRolloutPlan(loadPlan(), [
    { name: 'functions/setFavorite', state: 'ACTIVE', labels: { 'deployment-callable': 'true' }, serviceConfig: { environmentVariables: { PLANLI_ENFORCE_APP_CHECK: 'true' } } },
    { name: 'functions/notEnforced', state: 'ACTIVE', labels: { 'deployment-callable': 'true' }, serviceConfig: {} },
  ], []);
  const alert = plan.policies.find((p) => p.userLabels.planli_control === 'app-check-rejected');
  assert.equal(alert.enabled, true);
  assert.match(alert.conditions[0].conditionMatchedLog.filter, /setfavorite/);
  assert.doesNotMatch(alert.conditions[0].conditionMatchedLog.filter, /notenforced/);
  assert.match(alert.conditions[0].conditionMatchedLog.filter, /APP_CHECK_REPLAYED/);
  assert.equal(plan.policies.at(-1).enabled, false);
});

test('service rejection metric becomes enabled only with an in-scope enforced service', () => {
  const services = [{ name: 'projects/633543026638/services/firestore.googleapis.com', enforcementMode: 'ENFORCED' }];
  const plan = appCheckRolloutPlan(loadPlan(), [], services);
  assert.equal(plan.policies.at(-1).enabled, true);
  assert.match(plan.policies.at(-1).conditions[0].conditionThreshold.filter, /result="DENY"/);
  assert.equal(plan.policies.find((p) => p.userLabels.planli_control === 'app-check-rejected').enabled, false);
});

test('provider omission of zero threshold is equivalent but nonzero drift remains blocked', () => {
  const plan = appCheckRolloutPlan(loadPlan(), [], []);
  const channel = { ...plan.channel, name: 'channels/test' };
  const policies = plan.policies.map((policy) => structuredClone(policyBody(policy, channel.name)));
  delete policies.at(-1).conditions[0].conditionThreshold.thresholdValue;
  assert(buildActions(plan, [channel], policies).actions.every((action) => action.action.startsWith('reuse-')));
  policies.at(-1).conditions[0].conditionThreshold.thresholdValue = 1;
  assert.throws(() => buildActions(plan, [channel], policies), /differs/);
});

test('only reviewed App Check fields may update; unrelated drift remains blocked', () => {
  const base = loadPlan();
  const channel = { ...base.channel, name: 'projects/planli-f0b12/notificationChannels/test' };
  const existing = base.policies.map((policy, index) => ({ ...policyBody(policy, channel.name), name: `policies/${index}` }));
  const desired = appCheckRolloutPlan(base, [], []);
  assert.throws(() => buildActions(desired, [channel], existing), /differs/);
  const actions = buildActions(desired, [channel], existing, { allowAppCheckUpdate: true }).actions;
  assert(actions.some((action) => action.action === 'update-app-check-policy'));
  assert(actions.some((action) => action.control === 'app-check-service-rejected' && action.action === 'create-policy'));
  const drift = structuredClone(existing);
  drift[0].enabled = false;
  assert.throws(() => buildActions(desired, [channel], drift, { allowAppCheckUpdate: true }), /differs/);
  drift[0].enabled = true;
  drift[2].notificationChannels = ['unexpected'];
  assert.throws(() => buildActions(desired, [channel], drift, { allowAppCheckUpdate: true }), /Unreviewed/);
  assert.notEqual(monitoringStateHash([channel], existing), monitoringStateHash([channel], drift));
});
