const test = require('node:test');
const assert = require('node:assert/strict');

const {
  manifestFingerprint,
  retainedUserSets,
} = require('./resetPrelaunchContent');

test('prelaunch reset preserves the union of ADMIN and BOT accounts', () => {
  const users = [
    { uid: 'admin', customClaims: { admin: true } },
    { uid: 'bot', customClaims: { bot: true } },
    { uid: 'both', customClaims: { admin: true, bot: true } },
    { uid: 'ordinary', customClaims: {} },
  ];
  assert.deepEqual(retainedUserSets(users), {
    adminUids: ['admin', 'both'],
    botUids: ['bot', 'both'],
    keepUids: ['admin', 'bot', 'both'],
  });
});

test('prelaunch manifest fingerprint is order independent and detects new content', () => {
  const first = {
    projectId: 'planli-f0b12',
    keep: { uids: ['bot', 'admin'] },
    delete: { countries: ['countries/IL', 'countries/FR'], routes: [] },
  };
  const reordered = {
    projectId: 'planli-f0b12',
    keep: { uids: ['admin', 'bot'] },
    delete: { routes: [], countries: ['countries/FR', 'countries/IL'] },
  };
  assert.equal(manifestFingerprint(first), manifestFingerprint(reordered));
  assert.notEqual(
    manifestFingerprint(first),
    manifestFingerprint({ ...first, delete: { ...first.delete, routes: ['routes/new'] } })
  );
});
