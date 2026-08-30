const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIRMATION,
  assertSafeManifest,
  deleteBlockedUserReferences,
  manifestFingerprint,
  parseArgs,
} = require('./deleteNonAdminUsers');

test('non-admin deletion is dry-run by default and requires an explicit keeper', () => {
  assert.throws(() => parseArgs([]), /keep-email/);
  assert.throws(
    () => parseArgs(['--keep-email', 'owner@example.com', '--media-bucket', 'attacker-controlled-bucket']),
    /active PlanLi media bucket/
  );
  assert.deepEqual(parseArgs(['--keep-email', 'owner@example.com']), {
    apply: false,
    confirmation: null,
    expectedFingerprint: null,
    keepEmail: 'owner@example.com',
    mediaBucket: 'planli-f0b12-media-eu',
  });
  assert.deepEqual(parseArgs([
    '--apply', '--confirm', CONFIRMATION, '--fingerprint', 'abc', '--keep-email', ' Owner@Example.com ',
  ]), {
    apply: true,
    confirmation: CONFIRMATION,
    expectedFingerprint: 'abc',
    keepEmail: 'owner@example.com',
    mediaBucket: 'planli-f0b12-media-eu',
  });
});

test('manifest fingerprint changes when the exact deletion scope changes', () => {
  const manifest = {
    projectId: 'project-1',
    keep: { uid: 'admin-1' },
    delete: { authUsers: [{ uid: 'user-1' }] },
  };
  assert.notEqual(
    manifestFingerprint(manifest),
    manifestFingerprint({ ...manifest, delete: { authUsers: [{ uid: 'user-2' }] } })
  );
});

test('maintenance deletion refuses Apple-linked accounts and a non-admin keeper', () => {
  assert.throws(() => assertSafeManifest({
    keep: { adminClaim: true, registryActive: true },
    delete: { authUsers: [{ uid: 'apple-1', providers: ['apple.com'] }] },
  }), /Apple-linked/);
  assert.throws(() => assertSafeManifest({
    keep: { adminClaim: false, registryActive: true },
    delete: { authUsers: [] },
  }), /not an active admin/);
});

test('blocked-user cleanup filters locally without requiring a composite index', async () => {
  const deletedPaths = [];
  const documents = [
    { ref: { path: 'users/keeper/blockedUsers/deleted-1' }, data: () => ({ blockedUid: 'deleted-1' }) },
    { ref: { path: 'users/keeper/blockedUsers/kept-1' }, data: () => ({ blockedUid: 'kept-1' }) },
  ];
  const db = {
    collectionGroup: () => ({ get: async () => ({ docs: documents }) }),
    batch: () => ({
      delete: (ref) => deletedPaths.push(ref.path),
      commit: async () => {},
    }),
  };

  assert.equal(await deleteBlockedUserReferences(db, ['deleted-1']), 1);
  assert.deepEqual(deletedPaths, ['users/keeper/blockedUsers/deleted-1']);
});
