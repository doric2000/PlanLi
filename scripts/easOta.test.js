'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, executeOta, assertUpdates, assertProductionChannel } = require('./easOta');
test('a second release cannot remove or replace an existing lock', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { acquireReleaseLock } = require('./easOta');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planli-lock-'));
  const file = path.join(directory, 'ota.lock');
  const descriptor = acquireReleaseLock(file);
  try {
    fs.writeFileSync(descriptor, 'original owner');
    assert.throws(() => acquireReleaseLock(file), /lock already exists/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'original owner');
  } finally { fs.closeSync(descriptor); fs.unlinkSync(file); fs.rmdirSync(directory); }
});
test('resume environment binding detects masked variable edits and relevant local changes', () => {
  const { environmentDigest } = require('./easOta');
  const read = args => args.includes('project') ? 'ID a\nValue *****\nUpdated at 2026-09-26' : 'No variables';
  const initial = environmentDigest(read, { EXPO_PUBLIC_API: 'a', TERM: 'a' });
  assert.equal(initial, environmentDigest(read, { EXPO_PUBLIC_API: 'a', TERM: 'b' }));
  assert.notEqual(initial, environmentDigest(args => read(args).replace('2026-09-26', '2026-09-27'), { EXPO_PUBLIC_API: 'a' }));
  assert.notEqual(initial, environmentDigest(read, { EXPO_PUBLIC_API: 'b' }));
});

function fixture() {
  const events = [];
  const head = 'a'.repeat(40);
  const targets = ['android', 'ios'].map(platform => ({ platform, current: false,
    baseline: { platform, runtime: '1.4.0', metadataCrlfSha1: {}, dependencyLayout: 'local-copy' },
    lineage: { groupId: 'old-' + platform }, deployedCommit: 'b'.repeat(40) }));
  const state = { id: 'test', message: 'Shared navigation fix', sources: {}, native: {}, artifacts: {}, operations: {}, published: {} };
  const source = { recordPath: 'source.json' };
  const services = {
    validate: () => events.push('validate'),
    prepare: () => { events.push('prepare'); return source; },
    native: target => { events.push('native-' + target.platform); return { fingerprint: target.platform }; },
    fresh: () => events.push('fresh'),
    publish: ({ kind, targets }) => {
      events.push(kind);
      return targets.map(target => ({ id: kind + '-' + target.platform, platform: target.platform,
        group: kind + '-group', branch: kind === 'candidate' ? 'staging' : 'production',
        gitCommitHash: head, runtimeVersion: '1.4.0' }));
    },
    candidate: target => { events.push('artifact-' + target.platform); return { sha256: target.platform }; },
    delivery: target => { events.push('delivery-' + target.platform); return { verified: true }; },
    recover: () => { throw new Error('No recovery expected'); },
  };
  const input = { context: { head, targets }, state, save: () => {}, services };
  return { ...input, input, events };
}

test('default selects both platforms and apply is explicit', () => {
  assert.equal(parseArgs([]).platform, 'all');
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--platform', 'android']).platform, 'android');
  assert.throws(() => parseArgs(['--platform', 'windows']), /Platform/);
  assert.throws(() => parseArgs(['--platform']), /requires/);
  assert.throws(() => parseArgs(['--apply']), /message/);
});

test('both platforms share one validation, preparation, export and promotion', async () => {
  const f = fixture();
  await executeOta(f.input);
  for (const step of ['validate', 'prepare', 'candidate', 'production']) assert.equal(f.events.filter(item => item === step).length, 1, step);
  assert.ok(f.events.indexOf('native-ios') < f.events.indexOf('candidate'));
  assert.ok(f.events.indexOf('artifact-ios') < f.events.indexOf('production'));
  assert.deepEqual(Object.keys(f.state.published), ['android', 'ios']);
  assert.equal(f.state.status, 'complete');
});

test('an unchanged iOS app receives no second publication', async () => {
  const f = fixture();
  f.context.targets[1].current = true;
  await executeOta(f.input);
  assert.deepEqual(Object.keys(f.state.published), ['android']);
  assert.ok(!f.events.includes('native-ios'));
});

test('a native mismatch on either platform prevents every upload', async () => {
  const f = fixture();
  f.services.native = target => { if (target.platform === 'ios') throw new Error('native mismatch'); return {}; };
  await assert.rejects(executeOta(f.input), /native mismatch/);
  assert.ok(!f.events.includes('candidate'));
});

test('a bad candidate blocks production for both platforms', async () => {
  const f = fixture();
  f.services.candidate = target => { if (target.platform === 'ios') throw new Error('bad bundle'); return {}; };
  await assert.rejects(executeOta(f.input), /bad bundle/);
  assert.ok(!f.events.includes('production'));
});

test('resume after delivery failure reuses publications and verifies delivery again', async () => {
  const f = fixture();
  const delivery = f.services.delivery;
  f.services.delivery = () => { throw new Error('network interrupted'); };
  await assert.rejects(executeOta(f.input), /network interrupted/);
  f.services.delivery = delivery;
  await executeOta(f.input);
  assert.equal(f.events.filter(item => item === 'candidate').length, 1);
  assert.equal(f.events.filter(item => item === 'production').length, 1);
  assert.equal(f.state.status, 'complete');
});

test('uncertain publication is recovered by operation identity without another upload', async () => {
  const f = fixture();
  const publish = f.services.publish;
  let remote;
  f.services.publish = operation => { remote = publish(operation); throw new Error('response lost'); };
  await assert.rejects(executeOta(f.input), /response lost/);
  f.services.publish = publish;
  f.services.recover = () => remote;
  await executeOta(f.input);
  assert.equal(f.events.filter(item => item === 'candidate').length, 1);
  assert.equal(f.events.filter(item => item === 'production').length, 1);
});

test('unknown publication result stops rather than duplicate a release', async () => {
  const f = fixture();
  f.state.operations['candidate-0'] = { startedAt: 'earlier' };
  f.services.recover = () => [];
  await assert.rejects(executeOta(f.input), /uncertain/);
  assert.ok(!f.events.includes('candidate'));
});

test('publication must identify every requested platform, source, runtime and branch', () => {
  const f = fixture();
  const updates = f.services.publish({ kind: 'candidate', targets: f.context.targets });
  assert.doesNotThrow(() => assertUpdates(updates, f.context.targets, f.context.head, 'staging'));
  for (const override of [{ platform: 'ios' }, { gitCommitHash: 'wrong' }, { runtimeVersion: '1.3.0' }, { branch: 'production' }]) {
    assert.throws(() => assertUpdates([{ ...updates[0], ...override }, updates[1]], f.context.targets, f.context.head, 'staging'));
  }
});

test('production channel remapping is never hidden by a cache', () => {
  assert.doesNotThrow(() => assertProductionChannel({ currentPage: { name: 'production', updateBranches: [{ name: 'production' }] } }));
  assert.doesNotThrow(() => assertProductionChannel({ name: 'production', updateBranches: [{ name: 'production' }] }));
  assert.throws(() => assertProductionChannel({ name: 'production', updateBranches: [{ name: 'staging' }] }));
});
