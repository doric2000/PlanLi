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
  assert.deepEqual(result, { schemaVersion: 1, regionId: 'israel' });
  assert.equal(written.value.discoveryRegion.regionId, 'israel');
  assert.deepEqual(written.options, { merge: true });
});

test('rejects unsupported values before any write', async () => {
  await assert.rejects(() => setDiscoveryRegion({ admin: {}, auth: { uid: 'u1' }, data: { regionId: 'global' } }), /regionId/);
});
