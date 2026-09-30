const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CONFIRMATION,
  assertApplyGates,
  buildActions,
  loadPlan,
  manifestHash,
  parseArgs,
  preferenceIdFor,
  execute,
} = require('./securityCostQuotaPlan');

function infoFor(quota) {
  return {
    quotaId: quota.quotaId,
    dimensionsInfos: [{ details: [{ value: String(quota.preferredValue) }] }],
  };
}

test('reviewed quota manifest has exact cost boundaries and unique controls', () => {
  const plan = loadPlan();
  assert.equal(plan.quotas.length, 24);
  assert.equal(new Set(plan.quotas.map((entry) => `${entry.service}:${entry.quotaId}`)).size, 24);
  assert.equal(plan.quotas.find((entry) =>
    entry.quotaId === 'CreateAssessmentRequestsPerDayPerProject').preferredValue, 300);
  assert.equal(plan.quotas.find((entry) =>
    entry.quotaId === 'GetPlaceRequestPerDayPerProject').preferredValue, 300);
  assert.equal(plan.quotas.find((entry) =>
    entry.quotaId === 'SearchTextRequestPerDayPerProject').preferredValue, 0);
  assert.equal(plan.quotas.find((entry) =>
    entry.quotaId === 'defaultPerMinutePerProject').preferredValue, 60);
  assert.equal(plan.quotas.find((entry) =>
    entry.quotaId === 'signInWithCustomTokenPerMinutePerProject').preferredValue, 0);
  assert.equal(plan.quotas.find((entry) =>
    entry.quotaId === 'sendVerificationCodePerDayPerProject').preferredValue, 0);
});

test('apply requires exact project, manifest hash and typed confirmation', () => {
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

test('action builder reuses matching preferences and creates deterministic missing ones', () => {
  const plan = loadPlan();
  const quotaInfos = new Map();
  for (const service of [...new Set(plan.quotas.map((entry) => entry.service))]) {
    quotaInfos.set(service, plan.quotas.filter((entry) => entry.service === service).map(infoFor));
  }
  const first = plan.quotas[0];
  const preferences = [{
    name: 'projects/planli-f0b12/locations/global/quotaPreferences/existing',
    service: first.service,
    quotaId: first.quotaId,
    quotaConfig: { preferredValue: String(first.preferredValue) },
  }];
  const actions = buildActions(plan, preferences, quotaInfos);
  assert.equal(actions[0].action, 'reuse-quota-preference');
  assert.equal(actions[0].preferenceId, 'existing');
  assert.equal(actions[1].action, 'create-quota-preference');
  assert.equal(actions[1].preferenceId,
    preferenceIdFor(actions[1].service, actions[1].quotaId));
});

test('zero quota proto omissions are treated as an explicitly granted zero', () => {
  const plan = loadPlan();
  const quotaInfos = new Map();
  for (const service of [...new Set(plan.quotas.map((entry) => entry.service))]) {
    quotaInfos.set(service, plan.quotas.filter((entry) => entry.service === service).map((quota) =>
      quota.preferredValue === 0
        ? { quotaId: quota.quotaId, dimensionsInfos: [{ details: {} }] }
        : infoFor(quota)));
  }
  const preferences = plan.quotas.map((quota) => ({
    name: `projects/planli-f0b12/locations/global/quotaPreferences/${preferenceIdFor(quota.service, quota.quotaId)}`,
    service: quota.service,
    quotaId: quota.quotaId,
    quotaConfig: quota.preferredValue === 0
      ? { grantedValue: '0' }
      : { preferredValue: String(quota.preferredValue), grantedValue: String(quota.preferredValue) },
  }));
  assert(buildActions(plan, preferences, quotaInfos).every((entry) =>
    entry.action === 'reuse-quota-preference'));
});

test('action builder refuses unknown and duplicate live quota state', () => {
  const plan = loadPlan();
  const quotaInfos = new Map(plan.quotas.map((entry) => [entry.service, []]));
  assert.throws(() => buildActions(plan, [], quotaInfos), /unavailable/);

  for (const service of [...new Set(plan.quotas.map((entry) => entry.service))]) {
    quotaInfos.set(service, plan.quotas.filter((entry) => entry.service === service).map(infoFor));
  }
  const first = plan.quotas[0];
  const duplicate = {
    service: first.service,
    quotaId: first.quotaId,
    quotaConfig: { preferredValue: '1' },
  };
  assert.throws(() => buildActions(plan, [duplicate, duplicate], quotaInfos), /Multiple/);
});

test('argument parser refuses alternate projects and unknown flags', () => {
  assert.throws(() => parseArgs(['--project', 'other']), /Refusing/);
  assert.throws(() => parseArgs(['--force']), /Unknown/);
  assert.throws(() => parseArgs(['--phase', 'unknown']), /phase/);
});

test('early Routes phase selects only its two controls and cannot increase a lower live quota', () => {
  const plan = loadPlan();
  let routeMinute = 3000;
  const commandRunner = args => {
    if (args[1] === 'preferences') return [];
    const service = args.find(a => a.startsWith('--service=')).slice(10);
    return plan.quotas.filter(q => q.service === service).map(q => infoFor({ ...q,
      preferredValue: q.quotaId === 'ComputeRoutesRequestsPerMinutePerProject' ? routeMinute : q.preferredValue }));
  };
  const preview = execute({ commandRunner, phase: 'routes' });
  assert.equal(preview.actions.length, 2);
  assert(preview.actions.every(a => a.service === 'routes.googleapis.com'));
  routeMinute = 20;
  assert.throws(() => execute({ commandRunner, phase: 'routes' }), /only tighten/);
});

test('apply refuses stale live state before any quota write and can resume from a new preview', () => {
  const plan = loadPlan();
  let writes = 0;
  const values = new Map(plan.quotas.map(q => [q.quotaId, q.preferredValue]));
  const commandRunner = args => {
    if (args[1] === 'preferences') return [];
    if (args[1] === 'info') {
      const service = args.find(a => a.startsWith('--service=')).slice(10);
      return plan.quotas.filter(q => q.service === service).map(q => infoFor({ ...q, preferredValue: values.get(q.quotaId) }));
    }
    writes++; throw new Error('Unexpected write');
  };
  const preview = execute({ commandRunner });
  values.set('AutocompletePlacesRequestPerDayPerProject', 299);
  assert.throws(() => execute({ commandRunner, apply: true, project: plan.projectId,
    manifestHash: preview.manifestSha256, stateHash: preview.stateSha256, confirm: CONFIRMATION }), /state changed/);
  assert.equal(writes, 0);
  assert.notEqual(execute({ commandRunner }).stateSha256, preview.stateSha256);
});
