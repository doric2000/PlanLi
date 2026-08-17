const test = require('node:test');
const assert = require('node:assert/strict');

const { bootstrapAdmin, parseArgs } = require('./bootstrapAdmin');

function createAdmin() {
  const writes = [];
  const user = { uid: 'owner-1', customClaims: { support: true } };
  return {
    writes,
    auth: () => ({
      getUserByEmail: async () => user,
      getUser: async () => user,
      setCustomUserClaims: async (uid, claims) => writes.push({ type: 'claims', uid, claims }),
    }),
    firestore: Object.assign(
      () => ({
        doc: (path) => ({
          set: async (data, options) => writes.push({ type: 'registry', path, data, options }),
        }),
      }),
      { FieldValue: { serverTimestamp: () => 'timestamp' } }
    ),
  };
}

test('admin bootstrap is dry-run by default and requires explicit apply', async () => {
  assert.deepEqual(parseArgs(['owner@example.com']), {
    identifier: 'owner@example.com',
    apply: false,
  });
  const adminApi = createAdmin();
  const result = await bootstrapAdmin({
    adminApi,
    identifier: 'owner@example.com',
    apply: false,
  });
  assert.equal(result.mode, 'dry-run');
  assert.deepEqual(adminApi.writes, []);
});

test('admin bootstrap preserves existing claims and writes the active registry in apply mode', async () => {
  const adminApi = createAdmin();
  const result = await bootstrapAdmin({ adminApi, identifier: 'owner-1', apply: true });
  assert.equal(result.mode, 'apply');
  assert.deepEqual(adminApi.writes[0], {
    type: 'claims', uid: 'owner-1', claims: { support: true, admin: true },
  });
  assert.equal(adminApi.writes[1].path, 'system/moderation/admins/owner-1');
  assert.equal(adminApi.writes[1].data.active, true);
});
