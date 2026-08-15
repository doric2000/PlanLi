const test = require('node:test');
const assert = require('node:assert/strict');
const { assertAdmin, assertRecentAuth } = require('./adminService');

test('admin operations require an explicit admin claim', () => {
  assert.throws(() => assertAdmin({ uid: 'user', token: {} }), (error) => error.details?.reason === 'admin_required');
  assert.doesNotThrow(() => assertAdmin({ uid: 'admin', token: { admin: true } }));
});

test('destructive admin operations require recent authentication', () => {
  assert.doesNotThrow(() => assertRecentAuth({ token: { auth_time: Math.floor(Date.now() / 1000) } }));
  assert.throws(
    () => assertRecentAuth({ token: { auth_time: Math.floor(Date.now() / 1000) - 3600 } }),
    (error) => error.details?.reason === 'recent_sign_in_required'
  );
});
