const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertAdmin,
  assertRecentAuth,
  getModerationDashboard,
  listAdminUsers,
  listModerationAudit,
  listModerationCases,
  moderateContent,
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
    'system/moderation/destinationReviews': [6],
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
  assert.deepEqual(result, { openCases: 7, urgentCases: 2, heldContent: 12, pendingDestinations: 6 });
});

test('report queue requests only unresolved cases by default', async () => {
  const whereCalls = [];
  const query = {
    orderBy: () => query,
    limit: () => query,
    where: (...args) => { whereCalls.push(args); return query; },
    get: async () => ({ size: 0, docs: [] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection(path) {
      assert.equal(path, 'system/moderation/cases');
      return query;
    },
  };
  const result = await listModerationCases({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: {},
  });
  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.deepEqual(whereCalls, [['status', 'in', ['open', 'auto_held']]]);
});

test('dismissing a report resolves its case without rewriting published content', async () => {
  let caseResolution;
  let contentReads = 0;
  const target = { type: 'recommendation', id: 'rec-1' };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true }) };
      if (path === 'system/moderation/cases/case-1') return {
        get: async () => ({ exists: true, data: () => ({ target }) }),
        set: async (value) => { caseResolution = value; },
      };
      if (path === 'recommendations/rec-1') {
        contentReads += 1;
        return { get: async () => ({ exists: true, data: () => ({ status: 'active' }) }), update: async () => assert.fail('dismiss must not update content') };
      }
      if (path.startsWith('system/moderation/audit/')) return { create: async () => {} };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
  };
  const admin = {
    firestore: () => db,
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };

  const result = await moderateContent({
    admin,
    auth: { uid: 'admin-1', token: { admin: true, auth_time: Math.floor(Date.now() / 1000), name: 'מנהלת' } },
    data: { caseId: 'case-1', target, action: 'dismiss', reason: 'הדיווח נבדק והתוכן תקין' },
  });
  assert.equal(result.action, 'dismiss');
  assert.equal(contentReads, 1);
  assert.equal(caseResolution.status, 'resolved_dismissed');
});

test('dismissing a report fails if the target became held after the row loaded', async () => {
  let resolved = false;
  const target = { type: 'recommendation', id: 'rec-1' };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true }) };
      if (path === 'system/moderation/cases/case-1') return {
        get: async () => ({ exists: true, data: () => ({ target, status: 'auto_held' }) }),
        set: async () => { resolved = true; },
      };
      if (path === 'recommendations/rec-1') return {
        get: async () => ({ exists: true, data: () => ({ status: 'moderation_hold' }) }),
      };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
  };
  await assert.rejects(
    moderateContent({
      admin: { firestore: () => db },
      auth: { uid: 'admin-1', token: { admin: true, auth_time: Math.floor(Date.now() / 1000) } },
      data: { caseId: 'case-1', target, action: 'dismiss', reason: 'התוכן תקין' },
    }),
    (error) => error.details?.reason === 'content_not_active'
  );
  assert.equal(resolved, false);
});

test('user search supports an exact display name after UID lookup is not applicable', async () => {
  const profileQuery = {
    where: () => profileQuery,
    limit: () => profileQuery,
    get: async () => ({ empty: false, docs: [{ id: 'user-1' }] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true }) };
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection(path) {
      assert.equal(path, 'users');
      return profileQuery;
    },
  };
  const authApi = {
    getUsers: async (identifiers) => {
      assert.deepEqual(identifiers, [{ uid: 'user-1' }]);
      return { users: [{ uid: 'user-1', displayName: 'דנה כהן', providerData: [], metadata: {} }] };
    },
  };
  const result = await listAdminUsers({
    admin: { firestore: () => db, auth: () => authApi },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: { query: 'דנה כהן' },
  });
  assert.equal(result.items[0].displayName, 'דנה כהן');
});

test('audit history hydrates legacy admin names from private profiles', async () => {
  const auditQuery = {
    orderBy: () => auditQuery,
    limit: () => auditQuery,
    get: async () => ({ size: 1, docs: [{ id: 'audit-1', data: () => ({ actorUid: 'admin-1', action: 'content_hold', reason: 'בדיקה' }) }] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true }) };
      return { path, id: path.split('/').pop() };
    },
    collection(path) {
      assert.equal(path, 'system/moderation/audit');
      return auditQuery;
    },
    getAll: async (...refs) => refs.map((ref) => ({ id: ref.id, data: () => ({ displayName: 'מנהלת פלאן לי' }) })),
  };
  const result = await listModerationAudit({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: {},
  });
  assert.equal(result.items[0].actorName, 'מנהלת פלאן לי');
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
