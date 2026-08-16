const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertAdmin,
  assertRecentAuth,
  getModerationDashboard,
  publicModerationCase,
  publicModerationReport,
  setUserEmailVerified,
} = require('./adminService');

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

test('dashboard uses Firestore counters without requesting Firebase Auth access', async () => {
  const counts = {
    'system/moderation/cases': [7, 2],
    recommendations: [3],
    routes: [4],
    trips: [5],
  };
  const offsets = new Map();
  const db = {
    doc: () => ({ get: async () => ({ exists: true }) }),
    collection(name) {
      const query = {
        where: () => query,
        count: () => ({
          get: async () => {
            const offset = offsets.get(name) || 0;
            offsets.set(name, offset + 1);
            return { data: () => ({ count: counts[name][offset] }) };
          },
        }),
      };
      return query;
    },
  };
  const admin = {
    firestore: () => db,
    auth: () => { throw new Error('dashboard must not access Firebase Auth'); },
  };

  const result = await getModerationDashboard({ admin, auth: { uid: 'admin', token: { admin: true } } });
  assert.deepEqual(result, { openCases: 7, urgentCases: 2, heldContent: 12 });
});

test('moderation report responses omit reporter identity', () => {
  const result = publicModerationReport({
    id: 'report-1',
    data: () => ({
      reporterId: 'private-reporter',
      targetOwnerId: 'owner-1',
      category: 'spam_scam_commercial',
      details: 'spam',
      createdAt: 'created',
      updatedAt: 'updated',
    }),
  });
  assert.deepEqual(result, {
    id: 'report-1',
    category: 'spam_scam_commercial',
    details: 'spam',
    createdAt: 'created',
    updatedAt: 'updated',
  });
  assert.equal('reporterId' in result, false);
});

test('moderation case responses never expose the reporter registry', () => {
  const result = publicModerationCase({
    id: 'case-1',
    target: { type: 'recommendation', id: 'rec-1' },
    targetPreview: { available: true, title: 'פוסט' },
    recentReporters: { 'private-user-1': 1, 'private-user-2': 2 },
    reportCount: 2,
    uniqueCount24h: 2,
  });
  assert.equal(result.reportCount, 2);
  assert.equal(result.targetPreview.title, 'פוסט');
  assert.equal('recentReporters' in result, false);
  assert.equal(JSON.stringify(result).includes('private-user'), false);
});

test('email verification validates the audit reason before mutating Firebase Auth', async () => {
  let updateCalls = 0;
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { get: async () => ({ exists: true }) };
      }
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
  };
  const authApi = {
    getUser: async () => ({ uid: 'user-1', customClaims: {} }),
    updateUser: async () => { updateCalls += 1; },
    revokeRefreshTokens: async () => {},
  };
  const admin = { firestore: () => db, auth: () => authApi };

  await assert.rejects(
    setUserEmailVerified({
      admin,
      auth: { uid: 'admin-1', token: { admin: true, auth_time: Math.floor(Date.now() / 1000) } },
      data: { identifier: 'user-1', verified: true, reason: '' },
    }),
    (error) => error.details?.reason === 'invalid_input'
  );
  assert.equal(updateCalls, 0);
});

test('user suspension callable declares a timeout suitable for bounded content cleanup', () => {
  const source = require('node:fs').readFileSync(require.resolve('./index'), 'utf8');
  assert.match(source, /exports\.setUserSuspension = callable\(\{[^}]*timeoutSeconds:\s*300[^}]*memory:\s*'1GiB'/s);
});
