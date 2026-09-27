const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { batchesFor, setEnforcementEnv, verifyEnabled, assertEvidence, requirePrevious,
  parseArgs, hash, CONFIRM, trafficServesRevision, assertSourceCompatible } = require('./securityAppCheckRollout');

const batches = batchesFor(fs.readFileSync(require.resolve('../functions/index'), 'utf8'));
test('committed operator-only corrections preserve the pinned deployment source', () => {
  const before = { revision: 'a', branch: 'fix/stage3', sha256: 'first' };
  const after = { revision: 'b', branch: 'fix/stage3', sha256: 'second' };
  assert.doesNotThrow(() => assertSourceCompatible(before, after, ['scripts/securityMonitoringPlan.js', 'README.md']));
  for (const file of ['functions/index.js', 'functions/.env.planli-f0b12', 'firebase.json', '.firebaserc', 'package.json']) {
    assert.throws(() => assertSourceCompatible(before, after, [file]), /deployment source changed/);
  }
  assert.throws(() => assertSourceCompatible(before, { ...after, revision: 'a' }, []), /changed/);
  assert.throws(() => assertSourceCompatible(before, { ...after, branch: 'other' }, ['README.md']), /changed/);
});
test('all 103 callables are covered exactly once, in bounded batches; services are ordered', () => {
  const functions = batches.filter((batch) => batch.kind === 'functions');
  assert.equal(new Set(functions.flatMap((batch) => batch.targets)).size, 103);
  assert.equal(functions.flatMap((batch) => batch.targets).length, 103);
  assert(functions.every((batch) => batch.targets.length <= 10));
  assert.deepEqual(functions[0].targets, ['issueGuestSession', 'getReactionState', 'setFavorite', 'listAdminSavedViews']);
  assert.equal(functions.at(-1).id, 'deletion');
  assert.deepEqual(batches.slice(-3).map((batch) => batch.id), ['firestore', 'storage', 'authentication']);
  assert(!batches.flatMap((batch) => batch.targets).includes('moderateContent'));
  assert(!batches.flatMap((batch) => batch.targets).includes('oauth2.googleapis.com'));
});
test('callable inventory drift blocks unattended broadening', () => {
  assert.throws(() => batchesFor('exports.unexpected = callable('), /inventory changed/);
});
test('runtime env changes preserve other values and refuse ambiguity', () => {
  const original = 'EXAMPLE=value\nPLANLI_ENFORCE_APP_CHECK=false\n';
  assert.equal(setEnforcementEnv(original, true), 'EXAMPLE=value\nPLANLI_ENFORCE_APP_CHECK=true\n');
  assert.equal(setEnforcementEnv('EXAMPLE=value\n', true), 'EXAMPLE=value\nPLANLI_ENFORCE_APP_CHECK=true\n');
  assert.throws(() => setEnforcementEnv(original + 'PLANLI_ENFORCE_APP_CHECK=true\n', true), /Duplicate/);
});
test('inventory read-back does not confuse active with enforced', () => {
  const batch = { kind: 'functions', targets: ['setFavorite'] };
  assert.equal(verifyEnabled(batch, { functions: [{ name: 'setFavorite', state: 'ACTIVE', enforced: false }] }), false);
  assert.equal(verifyEnabled(batch, { functions: [{ name: 'setFavorite', state: 'ACTIVE', enforced: true }] }), true);
  assert.equal(verifyEnabled(batch, { functions: [] }), false);
});
test('later batches require accepted evidence, not just a successful deployment', () => {
  const manifest = { batches: batches.slice(0, 2) };
  assert.throws(() => requirePrevious(manifest, { batches: { canary: { status: 'applied' } } }, batches[1]), /lacks accepted/);
  assert.doesNotThrow(() => requirePrevious(manifest, { batches: { canary: { status: 'accepted' } } }, batches[1]));
});
test('canary evidence binds exact deployment, email delivery and observation window', () => {
  const now = Date.now();
  const entry = { status: 'applied', manifestSha256: 'test-manifest', postState: [{ revision: 'rev1' }], appliedAt: new Date(now - 16 * 60000).toISOString() };
  const evidence = { batch: 'canary', manifestSha256: 'test-manifest', postStateSha256: hash(entry.postState),
    checks: Object.fromEntries(['positive', 'negative', 'logsReviewed', 'ios', 'android', 'web', 'guest', 'emailReceived'].map((key) => [key, true])),
    receipts: ['test receipt'] };
  assert.doesNotThrow(() => assertEvidence(batches[0], evidence, entry, now));
  assert.throws(() => assertEvidence(batches[0], { ...evidence, postStateSha256: 'other' }, entry, now), /bound/);
  assert.throws(() => assertEvidence(batches[0], { ...evidence, checks: { ...evidence.checks, emailReceived: false } }, entry, now), /Required smoke/);
  assert.throws(() => assertEvidence(batches[0], evidence, { ...entry, appliedAt: new Date(now).toISOString() }, now), /window/);
});
test('dry-run is the default and mutations require explicit confirmation', () => {
  assert.equal(parseArgs(['--manifest', 'manifest.json', '--batch', 'canary']).apply, false);
  assert.throws(() => parseArgs(['--apply']), /confirmation/);
  assert.throws(() => parseArgs(['--apply', '--confirm', CONFIRM, '--verify', '--rollback']), /one rollout/);
  assert.equal(parseArgs(['--apply', '--confirm', CONFIRM]).apply, true);
  assert.throws(() => parseArgs(['--force']), /Unknown/);
});

test('read-back checks exact source and actual traffic, including rollback completion', () => {
  const batch = { kind: 'functions', targets: ['setFavorite'] };
  const state = { functions: [{ name: 'setFavorite', state: 'ACTIVE', enforced: true, sourceMarker: 'expected' }] };
  assert.equal(verifyEnabled(batch, state, 'expected'), true);
  assert.equal(verifyEnabled(batch, state, 'different'), false);
  const service = { terminalCondition: { state: 'CONDITION_SUCCEEDED' }, trafficStatuses: [{ revision: 'rev-1', percent: 100 }] };
  assert.equal(trafficServesRevision(service, 'rev-1'), true);
  assert.equal(trafficServesRevision(service, 'rev-2'), false);
  assert.equal(trafficServesRevision({ ...service, reconciling: true }, 'rev-1'), false);
  assert.equal(trafficServesRevision({ ...service, trafficStatuses: [{ revision: 'rev-1', percent: 50 }, { revision: 'rev-2', percent: 50 }] }, 'rev-1'), false);
});
