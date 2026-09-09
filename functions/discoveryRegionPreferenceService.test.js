const test = require('node:test');
const assert = require('node:assert/strict');
const { setDiscoveryRegion } = require('./discoveryRegionPreferenceService');

test('persists a validated signed-in preference through the server boundary', async () => {
  let written;
  const ref = { get: async () => ({ exists: true }), set: async (value, options) => { written = { value, options }; } };
  const admin = {
    firestore: Object.assign(() => ({ doc: () => ref }), { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }),
  };
  const result = await setDiscoveryRegion({ admin, auth: { uid: 'u1' }, data: { regionId: 'israel' } });
  assert.deepEqual(result, { schemaVersion: 2, mode: 'region', regionId: 'israel' });
  assert.equal(written.value.discoveryRegion.regionId, 'israel');
  assert.deepEqual(written.options, { merge: true });
});

test('rejects unsupported values before any write', async () => {
  await assert.rejects(() => setDiscoveryRegion({ admin: {}, auth: { uid: 'u1' }, data: { regionId: 'global' } }), /regionId/);
});


test('stores explicit global in the private profile and clears an old region', async () => {
  let written; let target;
  const ref = { get: async () => ({ exists: true }), set: async (value) => { written = value; } };
  const admin = { firestore: Object.assign(() => ({ doc: (p) => { target = p; return ref; } }), { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }) };
  assert.deepEqual(await setDiscoveryRegion({ admin, auth: { uid: 'u1' }, data: { mode: 'global' } }), { schemaVersion: 2, mode: 'global', regionId: null });
  assert.equal(target, 'users/u1');
  assert.deepEqual(written.discoveryRegion, { schemaVersion: 2, mode: 'global', regionId: null, selectedAt: 'SERVER_TIME' });
});
for (const data of [{ mode: 'global', regionId: 'europe' }, { mode: 'globalish' }, { mode: 'region' }, { mode: 'bad', regionId: 'europe' }]) {
  test('rejects invalid discovery scope ' + JSON.stringify(data), async () => {
    await assert.rejects(() => setDiscoveryRegion({ admin: {}, auth: { uid: 'u1' }, data }), { code: 'invalid-argument' });
  });
}
test('global still requires authentication and an existing private profile', async () => {
  await assert.rejects(() => setDiscoveryRegion({ admin: {}, data: { mode: 'global' } }), { code: 'unauthenticated' });
  const admin = { firestore: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
  await assert.rejects(() => setDiscoveryRegion({ admin, auth: { uid: 'u1' }, data: { mode: 'global' } }), { code: 'failed-precondition' });
});
