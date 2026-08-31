const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertApplyAllowed,
  hasMalformedCreatedAt,
  isEmptyPlainObject,
  manifestFingerprint,
  parseOptions,
  repairManifest,
} = require('./repairNotificationCreatedAt');

test('notification repair recognizes only schema-v2 empty-map createdAt values', () => {
  assert.equal(isEmptyPlainObject({}), true);
  assert.equal(isEmptyPlainObject([]), false);
  assert.equal(hasMalformedCreatedAt({ schemaVersion: 2, createdAt: {} }), true);
  assert.equal(hasMalformedCreatedAt({ schemaVersion: 1, createdAt: {} }), false);
  assert.equal(hasMalformedCreatedAt({
    schemaVersion: 2,
    createdAt: { toMillis: () => 1 },
  }), false);
});

test('notification repair stays dry-run and requires project plus manifest fingerprint for apply', () => {
  const options = parseOptions(['--limit', '50']);
  assert.deepEqual(options, {
    apply: false,
    limit: 50,
    fingerprint: '',
    confirmProject: '',
  });
  const manifest = repairManifest([{
    ref: { path: 'users/admin/notifications/row' },
    createTime: { toMillis: () => 10 },
    updateTime: { toMillis: () => 20 },
  }], options.limit);
  const fingerprint = manifestFingerprint(manifest);
  assert.doesNotThrow(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint },
    fingerprint,
    truncated: false,
  }));
  assert.throws(() => assertApplyAllowed({
    options: { ...options, apply: true, confirmProject: 'planli-f0b12', fingerprint },
    fingerprint,
    truncated: true,
  }), /more malformed notifications/u);
});
