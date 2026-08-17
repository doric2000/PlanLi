const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIRMATION,
  manifestFingerprint,
  parseArgs,
} = require('./repairBetaOwnerAccount');

test('owner repair is dry-run by default and requires an exact email', () => {
  assert.deepEqual(parseArgs(['--email', ' A@B.COM ']), {
    apply: false,
    confirmation: null,
    expectedFingerprint: null,
    email: 'a@b.com',
  });
  assert.deepEqual(parseArgs([
    '--email', 'a@b.com', '--apply', '--confirm', CONFIRMATION, '--fingerprint', 'abc',
  ]), {
    apply: true,
    confirmation: CONFIRMATION,
    expectedFingerprint: 'abc',
    email: 'a@b.com',
  });
});

test('owner repair fingerprint covers auth, document state, and target versions', () => {
  const manifest = {
    projectId: 'project-1',
    uid: 'owner-1',
    email: 'a@b.com',
    auth: { emailVerified: false },
    userDocument: { updateTime: 'time-1' },
    target: { privacyVersion: 'v1' },
  };
  assert.notEqual(
    manifestFingerprint(manifest),
    manifestFingerprint({ ...manifest, target: { privacyVersion: 'v2' } })
  );
});
