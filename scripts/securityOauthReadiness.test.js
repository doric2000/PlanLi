const assert = require('node:assert/strict');
const test = require('node:test');

const { loadPlan, manifestHash, summarize } = require('./securityOauthReadiness');

function functionRow(name, secrets = [], serviceAccount =
  'planli-core-functions@planli-f0b12.iam.gserviceaccount.com') {
  return {
    name: `projects/planli-f0b12/locations/europe-west1/functions/${name}`,
    buildConfig: { entryPoint: name },
    serviceConfig: {
      serviceAccountEmail: serviceAccount,
      secretEnvironmentVariables: secrets.map((key) => ({ key })),
    },
  };
}

function exactInventory(plan, bound = false) {
  return {
    enabledServices: plan.requiredServices.map((name) => ({ config: { name } })),
    iam: {
      bindings: [{
        role: plan.requiredRole,
        members: [`serviceAccount:${plan.serviceAccount}`],
      }],
    },
    functions: plan.functionTargets.map((name) => functionRow(
      name, bound ? plan.legacySecrets : [],
    )),
    apiKeys: plan.apiKeyDeletionTargets.map((target) => ({ ...target })),
    secrets: plan.legacySecrets.map((name) => ({ name: `projects/p/secrets/${name}` })),
  };
}

test('OAuth rollout manifest pins exact functions, identities and credential deletion targets', () => {
  const plan = loadPlan();
  assert.equal(plan.functionTargets.length, 8);
  assert.equal(plan.apiKeyDeletionTargets.length, 2);
  assert.equal(plan.legacySecrets.length, 2);
  assert.deepEqual(plan.requiredServices, [
    'geocoding-backend.googleapis.com',
    'places.googleapis.com',
  ]);
  assert.match(manifestHash(plan), /^[a-f0-9]{64}$/);
});

test('readiness distinguishes deploy readiness from safe credential deletion', () => {
  const plan = loadPlan();
  const sourceState = {
    oauthModuleExists: true, legacyAdapterExists: false, boundLegacySecrets: [],
  };
  const beforeDeploy = summarize(plan, exactInventory(plan, true), sourceState);
  assert.equal(beforeDeploy.readyToDeployOauth, true);
  assert.equal(beforeDeploy.readyToDeleteLegacyCredentials, false);
  assert.equal(beforeDeploy.legacyBindings.length, 8);
  const afterDeploy = summarize(plan, exactInventory(plan, false), sourceState);
  assert.equal(afterDeploy.readyToDeployOauth, true);
  assert.equal(afterDeploy.readyToDeleteLegacyCredentials, true);
});

test('readiness fails closed on missing API, IAM, target, identity or local source removal', () => {
  const plan = loadPlan();
  const inventory = exactInventory(plan, false);
  inventory.enabledServices = [];
  inventory.iam = { bindings: [] };
  inventory.functions = inventory.functions.slice(1);
  inventory.apiKeys[0].displayName = 'conflict';
  const result = summarize(plan, inventory, {
    oauthModuleExists: false,
    legacyAdapterExists: true,
    boundLegacySecrets: ['GOOGLE_MAPS_KEY'],
  });
  assert.deepEqual(result.missingServices, plan.requiredServices);
  assert.equal(result.serviceUsageRoleGranted, false);
  assert.deepEqual(result.missingFunctions, [plan.functionTargets[0]]);
  assert.equal(result.apiKeyTargets[0].identityMatches, false);
  assert.equal(result.readyToDeployOauth, false);
  assert.equal(result.readyToDeleteLegacyCredentials, false);
});

test('readiness requires an unconditional IAM grant and checks duplicate bindings', () => {
  const plan = loadPlan();
  const inventory = exactInventory(plan, false);
  const member = `serviceAccount:${plan.serviceAccount}`;
  inventory.iam.bindings = [
    {
      role: plan.requiredRole,
      members: [member],
      condition: {
        title: 'expired-temporary-grant',
        expression: "request.time < timestamp('2025-01-01T00:00:00Z')",
      },
    },
    {
      role: plan.requiredRole,
      members: ['serviceAccount:someone-else@planli-f0b12.iam.gserviceaccount.com'],
    },
  ];

  const conditionalOnly = summarize(plan, inventory, {
    oauthModuleExists: true, legacyAdapterExists: false, boundLegacySecrets: [],
  });
  assert.equal(conditionalOnly.serviceUsageRoleGranted, false);
  assert.equal(conditionalOnly.conditionalServiceUsageBindings.length, 1);
  assert.equal(conditionalOnly.readyToDeployOauth, false);
  assert.equal(conditionalOnly.readyToDeleteLegacyCredentials, false);

  inventory.iam.bindings.push({ role: plan.requiredRole, members: [member] });
  const withUnconditionalGrant = summarize(plan, inventory, {
    oauthModuleExists: true, legacyAdapterExists: false, boundLegacySecrets: [],
  });
  assert.equal(withUnconditionalGrant.serviceUsageRoleGranted, true);
  assert.equal(withUnconditionalGrant.readyToDeployOauth, true);
  assert.equal(withUnconditionalGrant.readyToDeleteLegacyCredentials, true);
});
