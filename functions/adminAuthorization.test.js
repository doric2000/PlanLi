const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECENT_ADMIN_AUTH_SECONDS,
  assertRecentTotpAdminAuthentication,
  hasActiveAdminAccess,
} = require('./adminAuthorization');

const NOW_MS = Date.UTC(2026, 7, 29, 12, 0, 0);

function auth(overrides = {}) {
  return {
    uid: 'admin-1',
    token: {
      admin: true,
      auth_time: Math.floor(NOW_MS / 1000) - 60,
      firebase: { sign_in_second_factor: 'totp' },
      ...overrides,
    },
  };
}

function adminWithRegistry({ exists = true, active = true } = {}) {
  return {
    firestore() {
      return {
        doc(path) {
          assert.equal(path, 'system/moderation/admins/admin-1');
          return {
            async get() {
              return { exists, data: () => ({ active }) };
            },
          };
        },
      };
    },
  };
}

test('active admin override requires both recent authentication and TOTP', async () => {
  const admin = adminWithRegistry();
  await assert.rejects(
    hasActiveAdminAccess({
      admin,
      auth: auth({ auth_time: Math.floor(NOW_MS / 1000) - RECENT_ADMIN_AUTH_SECONDS - 1 }),
      requireRecentTotp: true,
      nowMs: NOW_MS,
    }),
    (error) => error?.details?.reason === 'recent_sign_in_required'
  );
  await assert.rejects(
    hasActiveAdminAccess({
      admin,
      auth: auth({ firebase: { sign_in_second_factor: 'password' } }),
      requireRecentTotp: true,
      nowMs: NOW_MS,
    }),
    (error) => error?.details?.reason === 'totp_required'
  );
  assert.equal(await hasActiveAdminAccess({
    admin,
    auth: auth(),
    requireRecentTotp: true,
    nowMs: NOW_MS,
  }), true);
});

test('inactive registry and non-admin callers never gain override access', async () => {
  assert.equal(await hasActiveAdminAccess({
    admin: adminWithRegistry({ active: false }),
    auth: auth(),
    requireRecentTotp: true,
    nowMs: NOW_MS,
  }), false);
  assert.equal(await hasActiveAdminAccess({
    admin: adminWithRegistry(),
    auth: { uid: 'user-1', token: {} },
    requireRecentTotp: true,
    nowMs: NOW_MS,
  }), false);
});

test('non-privileged active-admin lookup remains available for last-admin safety checks', async () => {
  assert.equal(await hasActiveAdminAccess({
    admin: adminWithRegistry(),
    auth: auth({ auth_time: 0, firebase: {} }),
    nowMs: NOW_MS,
  }), true);
  assert.throws(
    () => assertRecentTotpAdminAuthentication(auth({ auth_time: 0 }), NOW_MS),
    (error) => error?.details?.reason === 'recent_sign_in_required'
  );
});
