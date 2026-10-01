const test = require('node:test');
const assert = require('node:assert/strict');

const { createIngestionMemoryAdmin } = require('../testSupport/ingestionMemoryAdmin');
const { isPublicProfileEligible } = require('../publicProfiles');
const setup = require('./setupRecommendationIngestion');

function fakeAuth() {
  const users = new Map();
  return {
    users,
    getUser: async (uid) => {
      if (!users.has(uid)) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
      return users.get(uid);
    },
    createUser: async (user) => {
      assert.equal(user.email, undefined, 'the publisher has no email sign-in');
      assert.equal(user.password, undefined, 'the publisher has no password');
      users.set(user.uid, user);
      return user;
    },
  };
}

test('setup is dry-run by default and requires explicit project confirmation for writes', () => {
  assert.deepEqual(setup.parseArgs([]), { apply: false, enable: false, trialGroup: null, confirmProject: null });
  assert.deepEqual(setup.parseArgs(['--apply', '--trial-group=אתונה', '--confirm-project=planli-f0b12']),
    { apply: true, enable: false, trialGroup: 'אתונה', confirmProject: 'planli-f0b12' });
});

test('setup provisions one sign-in-less publisher, a disabled trial config, and unverified groups idempotently', async () => {
  const memoryAdmin = createIngestionMemoryAdmin({
    'countries/CZ/destinations/dst_XFjNCQCWnMCUscmnS738': { status: 'active' },
  });
  const { documents } = memoryAdmin;
  const db = memoryAdmin.firestore();
  const auth = fakeAuth();
  const plan = await setup.planSetup({ auth, firestore: db });
  assert.ok(plan.some((step) => step.action === 'create_auth_user'));
  assert.equal(documents.size, 1, 'planning writes nothing');

  await setup.applySetup({ auth, firestore: db, adminApp: memoryAdmin });
  await setup.applySetup({ auth, firestore: db, adminApp: memoryAdmin });
  assert.equal(auth.users.size, 1);
  const profile = documents.get(`users/${setup.PUBLISHER_UID}`);
  assert.equal(profile.displayName, 'המלצות מערכת');
  assert.equal(isPublicProfileEligible(profile), true);
  assert.equal(documents.get(`publicProfiles/${setup.PUBLISHER_UID}`).displayName, 'המלצות מערכת');
  const config = documents.get('system/recommendationIngestion/config/main');
  assert.equal(config.enabled, false);
  assert.equal(config.rolloutStage, 'trial');
  assert.equal(config.publisherUid, setup.PUBLISHER_UID);
  const groups = [...documents.entries()].filter(([key]) => key.startsWith('system/recommendationIngestion/groups/'));
  assert.equal(groups.length, 5);
  assert.ok(groups.every(([, group]) => group.enabled === false && group.verifiedAt === null));
  assert.equal(groups.filter(([, group]) => group.cityId).length, 1, 'only existing active destinations are bound');
});

test('the trial enables exactly one verified group with an active destination', async () => {
  const memoryAdmin = createIngestionMemoryAdmin({
    'countries/GR/destinations/dst_6DDALrP3ktGtLo1YeVKm': { status: 'active' },
  });
  const db = memoryAdmin.firestore();
  await setup.applySetup({ auth: fakeAuth(), firestore: db, adminApp: memoryAdmin, trialGroup: 'אתונה' });
  const enabled = [...memoryAdmin.documents.entries()]
    .filter(([key, value]) => key.startsWith('system/recommendationIngestion/groups/') && value.enabled);
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0][1].label, 'אתונה');
  assert.ok(enabled[0][1].verifiedAt instanceof Date);
  await assert.rejects(setup.enableTrialGroup({ firestore: db, label: 'באקו' }), /no active PlanLi destination/);
});
