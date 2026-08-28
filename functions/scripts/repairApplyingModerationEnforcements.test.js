const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertRepairApplyAllowed,
  parseOptions,
  repairPageFingerprint,
  summarize,
} = require('./repairApplyingModerationEnforcements');

function record(id, action, overrides = {}) {
  return {
    entry: { id },
    enforcement: {
      type: 'suspension', status: 'applying', userUid: `user-${id}`, stage: 'created', updatedAt: 10, ...overrides,
    },
    userData: { moderation: { status: 'active' } },
    authUser: { disabled: false },
    intended: true,
    disposition: { action, reason: action },
  };
}

test('repair CLI is dry-run by default and requires bounded explicit arguments', () => {
  assert.deepEqual(parseOptions(['--limit=25', '--after', 'cursor-1']), {
    apply: false,
    limit: 25,
    after: 'cursor-1',
    confirmProject: '',
    fingerprint: '',
  });
  assert.deepEqual(parseOptions([
    '--apply',
    '--confirm-project=planli-f0b12',
    '--fingerprint=abc',
  ]), {
    apply: true,
    limit: 100,
    after: '',
    confirmProject: 'planli-f0b12',
    fingerprint: 'abc',
  });
  assert.throws(() => parseOptions(['--limit=0']), /--limit/);
  assert.throws(() => parseOptions(['--after=bad\/path']), /--after/);
});

test('repair fingerprint is stable and detects state changes without exposing user IDs', () => {
  const records = [record('enforcement-1', 'resume')];
  const first = repairPageFingerprint({ after: '', limit: 100, records });
  const second = repairPageFingerprint({ after: '', limit: 100, records });
  const changed = repairPageFingerprint({
    after: '',
    limit: 100,
    records: [record('enforcement-1', 'resume', { updatedAt: 11 })],
  });
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.equal(first.includes('user-enforcement-1'), false);
});

test('repair summary exposes only bounded classifications and blocks ambiguous batches', () => {
  const counts = summarize([
    record('1', 'resume'),
    record('2', 'expire'),
    record('3', 'expire_before_activation'),
    record('4', 'cancel_before_activation'),
    record('5', 'supersede'),
    record('6', 'ambiguous'),
    record('7', 'ignore'),
  ]);
  assert.deepEqual(counts, {
    resume: 1,
    expire: 1,
    expireBeforeActivation: 1,
    cancelBeforeActivation: 1,
    supersede: 1,
    ambiguous: 1,
    ignored: 1,
    safeRemaining: 5,
    suspendedPastEnd: 1,
  });
  assert.throws(() => assertRepairApplyAllowed({
    options: { confirmProject: 'planli-f0b12', fingerprint: 'same' },
    fingerprint: 'same',
    counts,
  }), /ambiguous/);
});
