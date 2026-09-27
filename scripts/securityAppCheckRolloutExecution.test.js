const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const rollout = require('./securityAppCheckRollout');

// Execute the actual orchestration with an in-memory filesystem and control
// plane. No credentials, CLI deployments or network are available to this VM.
function harness({ batches, baseline, live, journal, traffic, failPatch }) {
  const file = path.resolve('test-manifest.json');
  const source = { revision: 'test', branch: 'fix/test', sha256: 'a'.repeat(64) };
  const manifest = { manifestSha256: 'test-manifest', source, batches, baseline };
  const files = new Map([[file, JSON.stringify(manifest)], [`${file}.journal.json`, JSON.stringify(journal)]]);
  const requests = [];
  const context = {
    ...rollout, ROOT: process.cwd(), PROJECT: 'planli-f0b12', REGION: 'europe-west1',
    path, process, Date, JSON, Promise, console, AbortSignal,
    sourceIdentity: () => source, gcloudAccessToken: () => ({ access_token: 'synthetic' }),
    inventory: async () => structuredClone(live), safeInventory: (value) => value,
    validateManifest: () => {},
    fs: { existsSync: (name) => files.has(name), readFileSync: (name) => files.get(name),
      openSync: () => 1, closeSync: () => {}, unlinkSync: () => {} },
    writeJson: (name, value) => files.set(name, JSON.stringify(value)),
    api: async (url, token, method = 'GET', body) => {
      requests.push({ url, method, body });
      if (url.includes('run.googleapis.com')) {
        if (url.includes('/apis/serving.knative.dev/')) {
          const name = url.split('/services/')[1].split('?')[0];
          const service = `projects/planli-f0b12/locations/europe-west1/services/${name}`;
          if (method === 'PUT') {
            assert.equal(body.metadata.resourceVersion, 'original-version');
            assert.deepEqual(body.spec.template, { unchanged: true });
            if (failPatch) await failPatch(service, traffic, body);
            traffic[service] = body.spec.traffic[0].revisionName;
            return { metadata: { resourceVersion: 'updated-version' } };
          }
          return { metadata: { resourceVersion: 'original-version' }, spec: { template: { unchanged: true } } };
        }
        const service = url.split('/v2/')[1].split('?')[0];
        if (service.includes('/revisions/')) {
          return { containers: [{ env: [{ name: 'PLANLI_ENFORCE_APP_CHECK', value: 'false' }] }] };
        }
        return { etag: 'test-etag', terminalCondition: { state: 'CONDITION_SUCCEEDED' },
          trafficStatuses: [{ revision: traffic[service], percent: 100 }] };
      }
      if (method === 'PATCH') {
        const current = live.services.find((entry) => url.includes(entry.name));
        Object.assign(current, body);
        return current;
      }
      return live.services.find((entry) => url.includes(entry.name));
    },
  };
  vm.createContext(context);
  vm.runInContext([rollout.assertServing, rollout.resolveServing, rollout.restoreTraffic, rollout.execute].map(String).join('\n'), context);
  return { requests, files, traffic, manifest,
    run: (options) => context.execute({ manifest: file, confirm: rollout.CONFIRM, ...options }),
    journal: () => JSON.parse(files.get(`${file}.journal.json`)),
  };
}
const fn = (name, revision, enforced = true) => ({ name, revision, configuredRevision: revision, enforced, state: 'ACTIVE',
  sourceMarker: 'a'.repeat(64), service: `projects/planli-f0b12/locations/europe-west1/services/${name}` });

test('interrupted multi-target rollback resumes only outstanding targets', async () => {
  const batch = { id: 'canary', kind: 'functions', targets: ['first', 'second'] };
  const before = [fn('first', 'first-old', false), fn('second', 'second-old', false)];
  let failOnce = true;
  const h = harness({ batches: [batch], baseline: { functions: before },
    live: { functions: [fn('first', 'first-new'), fn('second', 'second-new')] },
    journal: { manifestSha256: 'test-manifest', batches: { canary: { status: 'applied', before } } },
    traffic: Object.fromEntries(before.map((entry) => [entry.service, entry.name + '-new'])),
    failPatch: (service) => { if (service.endsWith('/second') && failOnce) { failOnce = false; throw new Error('Injected disconnect'); } },
  });
  await assert.rejects(h.run({ batch: 'canary', rollback: true, apply: true }), /Injected/);
  assert.equal(h.journal().batches.canary.status, 'rolling-back');
  await h.run({ batch: 'canary', rollback: true, apply: true });
  assert.equal(h.requests.filter((entry) => entry.method === 'PUT' && entry.url.endsWith('/first')).length, 1);
  assert.equal(h.traffic[before[0].service], 'first-old');
  assert.equal(h.traffic[before[1].service], 'second-old');
  const result = await h.run({ batch: 'canary', verify: true });
  assert.equal(result.mode, 'rolled-back');
});

test('uncertain successful rollback response is reconciled without repeating its PUT', async () => {
  const batch = { id: 'canary', kind: 'functions', targets: ['first'] };
  const before = [fn('first', 'first-old', false)];
  const h = harness({ batches: [batch], baseline: { functions: before },
    live: { functions: [fn('first', 'first-new')] },
    journal: { manifestSha256: 'test-manifest', batches: { canary: { status: 'applied', before } } },
    traffic: { [before[0].service]: 'first-new' },
    failPatch: (service, traffic, body) => { traffic[service] = body.spec.traffic[0].revisionName; throw new Error('Response lost'); },
  });
  await assert.rejects(h.run({ batch: 'canary', rollback: true, apply: true }), /Response lost/);
  await h.run({ batch: 'canary', rollback: true, apply: true });
  assert.equal(h.requests.filter((entry) => entry.method === 'PUT').length, 1);
  assert.equal((await h.run({ batch: 'canary', verify: true })).mode, 'rolled-back');
});

test('previous accepted traffic drift blocks further enforcement before any mutation', async () => {
  const first = { id: 'canary', kind: 'functions', targets: ['first'] };
  const next = { id: 'firestore', kind: 'service', targets: ['firestore.googleapis.com'] };
  const deployed = fn('first', 'first-new');
  const service = { name: 'projects/633543026638/services/firestore.googleapis.com', enforcementMode: 'UNENFORCED', etag: 'original' };
  const h = harness({ batches: [first, next], baseline: { functions: [deployed], services: [service] },
    live: { functions: [deployed], services: [service] },
    journal: { manifestSha256: 'test-manifest', batches: { canary: { status: 'accepted', postState: [deployed] } } },
    traffic: { [deployed.service]: 'first-old' },
  });
  await assert.rejects(h.run({ batch: 'firestore', apply: true }), /Previously accepted batch changed/);
  assert.equal(h.requests.filter((entry) => entry.method !== 'GET').length, 0);
  assert.equal(h.journal().batches.firestore, undefined);
});

test('new rollout baseline resolves serving revision and enforcement after rollback', async () => {
  const fnState = fn('first', 'first-new');
  const state = { functions: [fnState] };
  const context = { ...rollout, api: async (url) => url.includes('/revisions/')
    ? { containers: [{ env: [{ name: 'PLANLI_ENFORCE_APP_CHECK', value: 'false' }] }] }
    : { terminalCondition: { state: 'CONDITION_SUCCEEDED' }, trafficStatuses: [{ revision: 'first-old', percent: 100 }] } };
  vm.createContext(context);
  vm.runInContext(rollout.resolveServing.toString(), context);
  await context.resolveServing(state, 'synthetic', ['first']);
  assert.equal(fnState.configuredRevision, 'first-new');
  assert.equal(fnState.revision, 'first-old');
  assert.equal(fnState.enforced, false);
  assert.equal(fnState.sourceMarker, null);
});
