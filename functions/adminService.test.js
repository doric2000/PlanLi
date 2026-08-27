const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertAdmin,
  assertRecentAuth,
  finalizeReinstatement,
  getAdminResource,
  getModerationDashboard,
  listAdminUsers,
  listModerationAudit,
  listModerationCases,
  moderateContent,
  bulkUpdateModerationCases,
  updateModerationCase,
  sensitiveAdminActions,
  publicModerationCase,
  publicModerationReport,
  processExpiredModerationSuspensions,
  reinstateUserAccount,
  resolveModerationCase,
  searchAdminResources,
  setUserAdmin,
  setUserEmailVerified,
  updateAdminAttachedPlace,
} = require('./adminService');
const { ownerNotificationOutboxId } = require('./notificationService');

test('admin operations require an explicit admin claim', () => {
  assert.throws(() => assertAdmin({ uid: 'user', token: {} }), (error) => error.details?.reason === 'admin_required');
  assert.doesNotThrow(() => assertAdmin({ uid: 'admin', token: { admin: true } }));
});

test('an admin claim is rejected when the server-owned registry is missing or inactive', async () => {
  for (const registry of [null, { active: false }]) {
    const admin = {
      firestore: () => ({
        doc: () => ({
          get: async () => ({ exists: Boolean(registry), data: () => registry }),
        }),
      }),
    };
    await assert.rejects(
      getModerationDashboard({ admin, auth: { uid: 'admin-1', token: { admin: true } } }),
      (error) => error?.details?.reason === 'admin_required'
    );
  }
});

test('destructive admin operations require recent authentication', () => {
  assert.doesNotThrow(() => assertRecentAuth({ token: { auth_time: Math.floor(Date.now() / 1000) } }));
  assert.throws(
    () => assertRecentAuth({ token: { auth_time: Math.floor(Date.now() / 1000) - 3600 } }),
    (error) => error.details?.reason === 'recent_sign_in_required'
  );
});

test('sensitive-admin action list is explicit and contains only high-impact admin operations', () => {
  const actions = sensitiveAdminActions();
  assert.ok(actions.deactivateDestination?.recentSignIn);
    assert.ok(actions.setDestinationHebrewName?.recentSignIn);
    assert.ok(actions.updateDestinationPolicy?.recentSignIn);
    assert.ok(actions.startDestinationReassignment?.recentSignIn);
  assert.ok(actions.setUserAdmin?.recentSignIn);
  assert.ok(actions.resolveModerationCase?.recentSignIn);
  assert.ok(actions.updateAdminAttachedPlace?.recentSignIn);
  assert.equal(typeof actions.deactivateDestination.reason, 'string');
  assert.equal(actions.approveDestination, undefined);
});

test('non-sensitive destination/admin actions stay non-sensitive', () => {
  const actions = sensitiveAdminActions();
  for (const action of [
    'getModerationDashboard',
    'listModerationCases',
    'getModerationCase',
    'listHeldContent',
    'listAdminUsers',
    'getAdminUser',
    'listModerationAudit',
    'listDestinationReviews',
    'getDestinationReview',
    'recheckDestination',
    'approveDestination',
    'getDestinationImageCandidates',
    'selectDestinationImageCandidate',
    'setDestinationUploadedImage',
    'getAirportCandidates',
    'setDestinationAirport',
  ]) {
    assert.equal(actions[action], undefined, `${action} must remain non-sensitive`);
  }
});

test('sensitive admin actions still enforce recent sign-in before mutation', async () => {
  await assert.rejects(
    moderateContent({
      admin: {},
      auth: { uid: 'admin-1', token: { admin: true, auth_time: Math.floor(Date.now() / 1000) - 3600 } },
      data: {
        reason: 'בדיקת תקינות',
        action: 'dismiss',
        target: { type: 'recommendation', id: 'rec-1' },
      },
    }),
    (error) => error?.details?.reason === 'recent_sign_in_required'
  );
});

test('dashboard uses Firestore counters without requesting Firebase Auth access', async () => {
  const counts = {
    'system/moderation/cases': [7, 2, 1, 3, 4],
    recommendations: [3],
    routes: [4],
    trips: [5],
    'system/moderation/destinationReviews': [6],
    'system/moderation/jobs': [8],
  };
  const offsets = new Map();
  const db = {
    doc: () => ({ get: async () => ({ exists: true, data: () => ({ active: true }) }) }),
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
  assert.deepEqual(result, {
    openCases: 7,
    urgentCases: 2,
    myCases: 1,
    unassignedCases: 3,
    overdueCases: 4,
    heldContent: 12,
    pendingDestinations: 6,
    failedJobs: 8,
  });
});

test('case updates reject stale revisions before writing an assignment', async () => {
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      return { path };
    },
    async runTransaction(task) {
      return task({
        get: async () => ({ exists: true, id: 'case-1', data: () => ({ revision: 4, status: 'open' }) }),
        set: () => assert.fail('stale revisions must not write'),
      });
    },
  };
  const admin = { firestore: () => db };
  await assert.rejects(updateModerationCase({
    admin,
    auth: { uid: 'admin-1', token: { admin: true } },
    data: { caseId: 'case-1', expectedRevision: 3, operation: 'claim' },
  }), (error) => error?.details?.reason === 'case_revision_conflict');
});

test('a report that changes a leased case prevents resolution finalization', async () => {
  const deleted = Symbol('deleted');
  const target = { type: 'recommendation', id: 'rec-1' };
  let caseValue = {
    caseId: 'case-1',
    target,
    targetOwnerId: 'owner-1',
    revision: 3,
    status: 'open',
    reportCount: 1,
  };
  let transactionNumber = 0;
  const applyMerge = (value) => {
    for (const [key, entry] of Object.entries(value)) {
      if (entry === deleted) delete caseValue[key];
      else caseValue[key] = entry;
    }
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { path, get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      if (path === 'system/moderation/cases/case-1') return { path };
      if (path === 'recommendations/rec-1') {
        return { path, get: async () => ({ exists: true, data: () => ({ status: 'active', ownerId: 'owner-1' }) }) };
      }
      if (path.startsWith('system/moderation/cases/case-1/events/')
        || path.startsWith('system/moderation/audit/')) {
        return { path, create: async () => {} };
      }
      throw new Error(`Unexpected path ${path}`);
    },
    collection(path) {
      return { doc: () => ({ path: `${path}/generated`, create: async () => {} }) };
    },
    async runTransaction(handler) {
      transactionNumber += 1;
      if (transactionNumber === 2) {
        caseValue = {
          ...caseValue,
          status: 'open',
          revision: 5,
          reportCount: 2,
        };
        delete caseValue.decisionLease;
      }
      return handler({
        get: async (ref) => {
          assert.equal(ref.path, 'system/moderation/cases/case-1');
          return { exists: true, data: () => caseValue };
        },
        set: (ref, value) => {
          if (ref.path === 'system/moderation/cases/case-1') applyMerge(value);
        },
      });
    },
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { delete: () => deleted, serverTimestamp: () => 'server-time' },
  });

  await assert.rejects(resolveModerationCase({
    admin: { firestore },
    auth: {
      uid: 'admin-1',
      token: { admin: true, auth_time: Math.floor(Date.now() / 1000), name: 'מנהלת' },
    },
    data: {
      caseId: 'case-1',
      expectedRevision: 3,
      contentAction: 'dismiss',
      accountAction: { type: 'none' },
      reasonCode: 'no_violation',
    },
  }), (error) => error?.details?.reason === 'case_revision_conflict');
  assert.equal(caseValue.status, 'open');
  assert.equal(caseValue.revision, 5);
  assert.equal(caseValue.reportCount, 2);
  assert.equal(caseValue.decisionLease, undefined);
});

test('attached route place correction binds to the transactionally current revision', async () => {
  const updates = [];
  const rootPath = 'routes/route-1';
  const currentStopPath = 'routes/route-1/revisions/rev-2/days/day-1/stops/stop-1';
  const daysPath = 'routes/route-1/revisions/rev-2/days';
  const stopsPath = 'routes/route-1/revisions/rev-2/days/day-1/stops';
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { path, get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      return { path, create: async () => {} };
    },
    collection(path) {
      return { path, doc: () => ({ path: `${path}/generated`, create: async () => {} }) };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        if (ref.path === rootPath) {
          return {
            exists: true,
            data: () => ({
              activeRevisionId: 'rev-2',
              title: 'מסלול',
              description: 'תיאור',
              destinations: [{ countryId: 'IL', cityId: 'tel-aviv', cityName: 'תל אביב' }],
              categoryIds: ['culture'],
              subcategoryIds: [],
              facets: { interests: [] },
            }),
          };
        }
        if (ref.path === currentStopPath) {
          return {
            exists: true,
            data: () => ({
              destination: { countryId: 'IL', cityId: 'tel-aviv', cityName: 'תל אביב' },
              place: { placeId: 'old-place', name: 'Old place' },
              location: 'Old place',
            }),
          };
        }
        if (ref.path === daysPath) {
          return {
            docs: [{
              ref: { collection: () => ({ path: stopsPath }) },
            }],
          };
        }
        if (ref.path === stopsPath) {
          return {
            docs: [{
              ref: { path: currentStopPath },
              data: () => ({
                destination: { countryId: 'IL', cityId: 'tel-aviv', cityName: 'תל אביב' },
                place: { placeId: 'old-place', name: 'Old place' },
                location: 'Old place',
                locationPrecision: 'exact',
              }),
            }],
          };
        }
        throw new Error(`Unexpected transaction read ${ref.path}`);
      },
      update: (ref, value) => updates.push([ref.path, value]),
      set: () => {},
    }),
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'server-time' },
  });

  await updateAdminAttachedPlace({
    admin: { firestore },
    auth: { uid: 'admin-1', token: { admin: true, auth_time: Math.floor(Date.now() / 1000) } },
    data: {
      target: {
        type: 'route',
        id: 'route-1',
        subject: { kind: 'attached_place', dayId: 'day-1', stopId: 'stop-1' },
      },
      action: 'city_only',
      reason: 'דיוק לעיר בלבד',
    },
  });
  const stopUpdate = updates.find(([path]) => path === currentStopPath)?.[1];
  const rootUpdate = updates.find(([path]) => path === rootPath)?.[1];
  assert.equal(stopUpdate.location, 'תל אביב');
  assert.equal(stopUpdate.locationPrecision, 'general');
  assert.deepEqual(rootUpdate.summaryPlaces, ['תל אביב']);
  assert.equal(rootUpdate.search.prefixes.includes('old'), false);
  assert.equal(updates.some(([path]) => path.includes('/revisions/rev-1/')), false);
});

test('bulk moderation rejects more than 25 cases and never reaches a mutation', async () => {
  const admin = {
    firestore: () => ({
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ active: true }) }) }),
    }),
  };
  await assert.rejects(bulkUpdateModerationCases({
    admin,
    auth: { uid: 'admin-1', token: { admin: true } },
    data: {
      operation: 'claim',
      cases: Array.from({ length: 26 }, (_, index) => ({ caseId: `case-${index}`, expectedRevision: 0 })),
    },
  }), (error) => error?.details?.reason === 'invalid_input');
});

test('expired suspensions reinstate only the current enforcement and mark stale work superseded', async () => {
  const writes = [];
  const docs = [
    { id: 'current', data: () => ({ userUid: 'user-current' }), ref: { set: async (value) => writes.push(['current', value]) } },
    { id: 'stale', data: () => ({ userUid: 'user-stale' }), ref: { set: async (value) => writes.push(['stale', value]) } },
  ];
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ size: docs.length, docs }),
  };
  const db = {
    collection: () => query,
    doc(path) {
      if (path === 'users/user-current') return { get: async () => ({ exists: true, data: () => ({ moderation: { status: 'suspended', enforcementId: 'current' } }) }) };
      if (path === 'users/user-stale') return { get: async () => ({ exists: true, data: () => ({ moderation: { status: 'active', enforcementId: 'newer' } }) }) };
      throw new Error(`Unexpected path ${path}`);
    },
  };
  const firestore = () => db;
  firestore.Timestamp = { fromMillis: (value) => value };
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const reinstated = [];
  const audited = [];
  const result = await processExpiredModerationSuspensions({
    admin: { firestore },
    mediaBucket: 'bucket',
    now: 123,
    reinstateImpl: async ({ uid, expectedEnforcementId, requireExpired, now }) => {
      reinstated.push([uid, expectedEnforcementId, requireExpired, now]);
      return { reinstated: true };
    },
    auditImpl: async (value) => audited.push(value),
  });
  assert.deepEqual(result, { scanned: 2, reinstated: 1, superseded: 1 });
  assert.deepEqual(reinstated, [['user-current', 'current', true, 123]]);
  assert.equal(writes.find(([id]) => id === 'stale')[1].status, 'superseded');
  assert.equal(audited.length, 1);
});

test('reinstatement rechecks the exact enforcement before enabling Firebase Auth', async () => {
  let authMutations = 0;
  const db = {
    doc: (path) => ({ path }),
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        assert.equal(ref.path, 'users/user-1');
        return {
          exists: true,
          data: () => ({ moderation: { status: 'suspended', enforcementId: 'newer' } }),
        };
      },
      update: () => assert.fail('a stale enforcement must not claim the account'),
      set: () => assert.fail('a stale enforcement must not claim the account'),
    }),
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { delete: () => 'delete', serverTimestamp: () => 'time' },
  });
  const result = await reinstateUserAccount({
    admin: {
      firestore,
      auth: () => ({
        updateUser: async () => { authMutations += 1; },
        revokeRefreshTokens: async () => { authMutations += 1; },
      }),
    },
    uid: 'user-1',
    expectedEnforcementId: 'expired',
    requireExpired: true,
    now: 500,
  });
  assert.equal(result.reinstated, false);
  assert.equal(result.reason, 'enforcement_superseded');
  assert.equal(authMutations, 0);
});

test('reinstatement keeps enforcement retryable when media restoration fails', async () => {
  const authStates = [];
  let finalized = false;
  let released = false;
  await assert.rejects(reinstateUserAccount({
    admin: {
      auth: () => ({
        updateUser: async (_uid, value) => authStates.push(value.disabled),
        revokeRefreshTokens: async () => {},
      }),
    },
    uid: 'user-1',
    mediaBucket: 'bucket',
    acquireModerationTransitionImpl: async () => ({
      acquired: true,
      id: 'transition-1',
      uid: 'user-1',
      userData: { moderation: { status: 'suspended' } },
      enforcementId: 'enforcement-1',
    }),
    setMediaAvailabilityImpl: async ({ available }) => {
      assert.equal(available, true);
      throw new Error('storage unavailable');
    },
    finalizeReinstatementImpl: async () => { finalized = true; return true; },
    releaseModerationTransitionImpl: async () => { released = true; },
  }), /storage unavailable/u);
  assert.deepEqual(authStates, [false, true]);
  assert.equal(finalized, false);
  assert.equal(released, true);
});

test('reinstatement remains successful when transition cleanup fails after finalization', async () => {
  const authStates = [];
  const result = await reinstateUserAccount({
    admin: {
      auth: () => ({
        updateUser: async (_uid, value) => authStates.push(value.disabled),
        revokeRefreshTokens: async () => {},
      }),
    },
    uid: 'user-1',
    mediaBucket: 'bucket',
    acquireModerationTransitionImpl: async () => ({
      acquired: true,
      id: 'transition-1',
      uid: 'user-1',
      userData: { moderation: { status: 'suspended' } },
      enforcementId: 'enforcement-1',
    }),
    setMediaAvailabilityImpl: async ({ available }) => assert.equal(available, true),
    finalizeReinstatementImpl: async () => true,
    releaseModerationTransitionImpl: async () => {
      throw new Error('cleanup unavailable');
    },
  });
  assert.deepEqual(result, {
    uid: 'user-1',
    reinstated: true,
    enforcementId: 'enforcement-1',
  });
  assert.deepEqual(authStates, [false]);
});

test('reinstatement finalizes account, enforcement, profile state, and notification atomically', async () => {
  const writes = [];
  const deletes = [];
  const userRef = { path: 'users/user-1' };
  const enforcementRef = { path: 'system/moderation/enforcements/enforcement-1' };
  const db = {
    doc: (path) => ({ path }),
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        if (ref.path === userRef.path) {
          return {
            exists: true,
            data: () => ({ moderation: { status: 'suspended', enforcementId: 'enforcement-1', operationLease: { id: 'transition-1' } } }),
          };
        }
        if (ref.path === enforcementRef.path) {
          return { exists: true, data: () => ({ status: 'active', transitionId: 'transition-1' }) };
        }
        return { exists: false, data: () => null };
      },
      update: (ref, value) => writes.push(['update', ref.path, value]),
      set: (ref, value) => writes.push(['set', ref.path, value]),
      delete: (ref) => deletes.push(ref.path),
    }),
  };
  const firestore = Object.assign(() => db, {
    FieldValue: {
      delete: () => 'DELETE',
      increment: (value) => ({ increment: value }),
      serverTimestamp: () => 'TIME',
    },
  });
  const finalized = await finalizeReinstatement({
    admin: { firestore },
    transition: {
      id: 'transition-1',
      uid: 'user-1',
      userRef,
      enforcementId: 'enforcement-1',
      enforcementRef,
    },
    actorUid: 'system',
    reason: 'suspension_expired',
  });
  assert.equal(finalized, true);
  assert(writes.some(([kind, path, value]) => kind === 'update' && path === userRef.path && value['moderation.status'] === 'active'));
  assert(writes.some(([kind, path, value]) => kind === 'update' && path === enforcementRef.path && value.status === 'complete'));
  assert(writes.some(([kind, path, value]) => kind === 'set' && path.includes('/notifications/') && value.subtype === 'account_reinstated'));
  assert(deletes.includes('publicProfiles/user-1'));
});

test('concurrent cross-demotions preserve at least one active administrator', async () => {
  const activeAdmins = new Set(['admin-a', 'admin-b']);
  const claims = new Map([
    ['admin-a', { admin: true }],
    ['admin-b', { admin: true }],
  ]);
  let transactionTail = Promise.resolve();
  const db = {
    doc(path) {
      return {
        path,
        id: path.split('/').pop(),
        get: async () => {
          if (path.startsWith('system/moderation/admins/')) {
            const uid = path.split('/').pop();
            return { exists: activeAdmins.has(uid), data: () => ({ active: activeAdmins.has(uid) }) };
          }
          throw new Error(`Unexpected document read ${path}`);
        },
        set: async () => {},
        create: async () => {},
      };
    },
    collection(path) {
      if (path === 'system/moderation/admins') {
        return { where: () => ({ kind: 'active-admin-query' }) };
      }
      if (path.startsWith('users/')) {
        const query = {
          where: () => query,
          limit: () => query,
          get: async () => ({ empty: true, size: 0, docs: [] }),
        };
        return query;
      }
      return { doc: () => ({ path: `${path}/generated`, create: async () => {} }) };
    },
    collectionGroup: () => {
      const query = {
        where: () => query,
        limit: () => query,
        get: async () => ({ empty: true, docs: [] }),
      };
      return query;
    },
    runTransaction(handler) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      return previous.then(async () => {
        const writes = [];
        try {
          const result = await handler({
            get: async (ref) => {
              if (ref.kind === 'active-admin-query') {
                const docs = [...activeAdmins].map((uid) => ({ id: uid }));
                return { size: docs.length, docs };
              }
              if (ref.path?.startsWith('users/')) {
                return { exists: false, data: () => null };
              }
              throw new Error(`Unexpected transaction read ${ref.path || ref.kind}`);
            },
            set: (ref, value) => writes.push([ref, value]),
          });
          writes.forEach(([ref, value]) => {
            if (value.active === false) activeAdmins.delete(ref.id);
          });
          return result;
        } finally {
          release();
        }
      });
    },
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'time' },
  });
  const authApi = {
    getUser: async (uid) => ({ uid, customClaims: claims.get(uid) || {} }),
    setCustomUserClaims: async (uid, value) => { claims.set(uid, value); },
    revokeRefreshTokens: async () => {},
  };
  const admin = { firestore, auth: () => authApi };
  const recent = Math.floor(Date.now() / 1000);
  const results = await Promise.allSettled([
    setUserAdmin({
      admin,
      auth: { uid: 'admin-a', token: { admin: true, auth_time: recent } },
      data: { identifier: 'admin-b', admin: false, reason: 'בדיקת הרשאות' },
    }),
    setUserAdmin({
      admin,
      auth: { uid: 'admin-b', token: { admin: true, auth_time: recent } },
      data: { identifier: 'admin-a', admin: false, reason: 'בדיקת הרשאות' },
    }),
  ]);
  assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(results.filter((entry) => entry.status === 'rejected').length, 1);
  assert.equal(activeAdmins.size, 1);
  const remaining = [...activeAdmins][0];
  assert.equal(claims.get(remaining).admin, true);
});

test('admin access cannot be granted to an account whose deletion has started', async () => {
  const claimWrites = [];
  let registryActivated = false;
  const actorRef = { path: 'system/moderation/admins/admin-a' };
  const targetUserRef = { path: 'users/user-deleting' };
  const targetRegistryRef = { path: 'system/moderation/admins/user-deleting' };
  const db = {
    doc(path) {
      if (path === actorRef.path) {
        return { ...actorRef, get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      if (path === targetUserRef.path) return targetUserRef;
      if (path === targetRegistryRef.path) return targetRegistryRef;
      throw new Error(`Unexpected document ${path}`);
    },
    collection(path) {
      assert.equal(path, 'system/moderation/admins');
      return { where: () => ({ kind: 'active-admin-query' }) };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        if (ref === targetUserRef) {
          return { exists: true, data: () => ({ status: 'deleting', moderation: { status: 'deleting' } }) };
        }
        if (ref.kind === 'active-admin-query') return { docs: [{ id: 'admin-a' }], size: 1 };
        throw new Error(`Unexpected transaction read ${ref.path || ref.kind}`);
      },
      set: () => { registryActivated = true; },
    }),
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'time' },
  });
  const admin = {
    firestore,
    auth: () => ({
      getUser: async () => ({ uid: 'user-deleting', customClaims: {} }),
      setCustomUserClaims: async (_uid, value) => { claimWrites.push(value); },
      revokeRefreshTokens: async () => {},
    }),
  };
  await assert.rejects(setUserAdmin({
    admin,
    auth: {
      uid: 'admin-a',
      token: { admin: true, auth_time: Math.floor(Date.now() / 1000) },
    },
    data: { identifier: 'user-deleting', admin: true, reason: 'בדיקת הרשאות' },
  }), (error) => error.details?.reason === 'user_deleting');
  assert.deepEqual(claimWrites, [{ admin: true }, { admin: false }]);
  assert.equal(registryActivated, false);
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
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
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

test('filtered moderation pagination resumes after the last returned match', async () => {
  const docs = Array.from({ length: 70 }, (_, index) => ({
    id: `case-${String(index).padStart(2, '0')}`,
    data: () => ({
      target: index % 2 === 0
        ? { type: 'recommendation', id: `rec-${index}` }
        : { type: 'route', id: `route-${index}` },
      targetPreview: { available: true, title: `תוכן ${index}` },
      status: 'open',
      revision: 0,
    }),
  }));
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ size: docs.length, docs }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { path, get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      return { path };
    },
    collection: () => query,
    getAll: async (...refs) => refs.map((ref) => ({ ref, exists: true, data: () => ({ status: 'active' }) })),
  };
  const result = await listModerationCases({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: { targetTypes: ['recommendation'] },
  });
  assert.equal(result.items.length, 30);
  assert(result.items.every((item) => item.target.type === 'recommendation'));
  assert.equal(result.nextCursor, 'case-58');
});

test('admin resource search preserves buffered matches in its cursor', async () => {
  const docs = Array.from({ length: 40 }, (_, index) => ({
    id: `projection-${String(index).padStart(2, '0')}`,
    data: () => ({
      type: 'recommendation',
      status: 'active',
      search: { prefixes: ['חיפה'] },
      target: { type: 'recommendation', id: `rec-${index}` },
    }),
  }));
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ size: docs.length, docs }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { path, get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      return { path };
    },
    collection: () => query,
  };
  const result = await searchAdminResources({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: { query: 'חיפה' },
  });
  assert.equal(result.items.length, 30);
  assert.equal(result.nextCursor, 'projection-29');
});

test('admin resource lookup opens a suspended profile from private user data', async () => {
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { path, get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      if (path === 'users/user-1') {
        return {
          path,
          get: async () => ({
            exists: true,
            data: () => ({ displayName: 'משתמשת', moderation: { status: 'suspended' } }),
          }),
        };
      }
      return { path, get: async () => ({ exists: false, data: () => null }) };
    },
  };
  const result = await getAdminResource({
    admin: { firestore: () => db },
    auth: { uid: 'admin-1', token: { admin: true } },
    data: { target: { type: 'profile', id: 'user-1' } },
  });
  assert.equal(result.preview.title, 'משתמשת');
  assert.equal(result.preview.status, 'suspended');
});

test('dismissing a report resolves its case without rewriting published content', async () => {
  let caseResolution;
  let contentReads = 0;
  const target = { type: 'recommendation', id: 'rec-1' };
  let caseValue = { target, revision: 0, status: 'open' };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { path, get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      if (path === 'system/moderation/cases/case-1') return {
        path,
        get: async () => ({ exists: true, data: () => caseValue }),
      };
      if (path === 'recommendations/rec-1') {
        contentReads += 1;
        return { path, get: async () => ({ exists: true, data: () => ({ status: 'active' }) }), update: async () => assert.fail('dismiss must not update content') };
      }
      if (path.startsWith('system/moderation/cases/case-1/events/')
        || path.startsWith('system/moderation/audit/')) {
        return { path, create: async () => {} };
      }
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection(path) {
      return {
        doc: () => ({
          path: `${path}/generated`,
          create: async () => {},
        }),
      };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        assert.equal(ref.path, 'system/moderation/cases/case-1');
        return { exists: true, data: () => caseValue };
      },
      set: (ref, value) => {
        if (ref.path === 'system/moderation/cases/case-1') {
          caseValue = { ...caseValue, ...value };
          caseResolution = value;
        }
      },
    }),
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
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
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

test('restoring held content stages the owner alert in the status transaction', async () => {
  const target = { type: 'recommendation', id: 'rec-1' };
  const targetData = {
    status: 'moderation_hold',
    ownerId: 'owner-1',
    title: 'Held recommendation',
  };
  const transactionWrites = [];
  const db = {
    doc(path) {
      return {
        path,
        id: path.split('/').pop(),
        get: async () => {
          if (path === 'system/moderation/admins/admin-1') {
            return { exists: true, data: () => ({ active: true }) };
          }
          if (path === 'recommendations/rec-1') {
            return { exists: true, data: () => targetData };
          }
          if (path === 'users/owner-1') {
            return { exists: true, data: () => ({ moderation: { status: 'active' } }) };
          }
          return { exists: false, data: () => null };
        },
        create: async () => {},
      };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        if (ref.path === 'recommendations/rec-1') {
          return { ref, exists: true, data: () => targetData };
        }
        if (ref.path === 'users/owner-1') {
          return { ref, exists: true, data: () => ({ moderation: { status: 'active' } }) };
        }
        return { ref, exists: false, data: () => null };
      },
      update: (ref, value) => transactionWrites.push({ type: 'update', path: ref.path, value }),
      set: (ref, value, options) => transactionWrites.push({ type: 'set', path: ref.path, value, options }),
    }),
  };
  const admin = {
    firestore: Object.assign(() => db, {
      FieldValue: {
        increment: (amount) => ({ operation: 'increment', amount }),
        serverTimestamp: () => 'server-time',
      },
    }),
  };
  const result = await moderateContent({
    admin,
    auth: {
      uid: 'admin-1',
      token: { admin: true, auth_time: Math.floor(Date.now() / 1000) },
    },
    data: { target, action: 'restore', reason: 'Owner appeal approved after review' },
  });
  assert.equal(result.action, 'restore');
  assert(transactionWrites.some((entry) => (
    entry.type === 'update'
    && entry.path === 'recommendations/rec-1'
    && entry.value.status === 'active'
  )));
  const notificationWrite = transactionWrites.find((entry) => (
    entry.path.startsWith('users/owner-1/notifications/')
  ));
  assert.equal(notificationWrite.value.subtype, 'content_restored');
  assert.equal(notificationWrite.value.isRead, false);
  assert(transactionWrites.some((entry) => (
    entry.path === 'users/owner-1/notificationState/state'
    && entry.value.personalUnread?.amount === 1
  )));
});

test('a deleted target resumes its pending owner alert instead of failing content_missing', async () => {
  const target = { type: 'recommendation', id: 'rec-1' };
  const targetPath = 'recommendations/rec-1';
  const outboxId = ownerNotificationOutboxId('content_deleted', targetPath);
  const outboxPath = `system/moderation/ownerNotifications/${outboxId}`;
  const values = new Map([[outboxPath, {
    schemaVersion: 1,
    state: 'pending',
    version: 1,
    readyVersion: 0,
    uid: 'owner-1',
    subtype: 'content_deleted',
    target: {
      type: 'recommendation', id: 'rec-1', path: targetPath, title: 'Deleted', thumbUrls: [],
    },
  }]]);
  const db = {
    doc(path) {
      return {
        path,
        id: path.split('/').pop(),
        get: async () => {
          if (path === 'system/moderation/admins/admin-1') {
            return { exists: true, data: () => ({ active: true }) };
          }
          if (path === targetPath) return { exists: false, data: () => null };
          return { exists: values.has(path), data: () => values.get(path) };
        },
        create: async () => {},
      };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => ({
        ref,
        exists: values.has(ref.path),
        data: () => values.get(ref.path),
      }),
      update: (ref, patch) => values.set(ref.path, { ...values.get(ref.path), ...patch }),
    }),
    collectionGroup: (name) => {
      assert.equal(name, 'notifications');
      const query = {
        where: () => query,
        limit: () => query,
        get: async () => ({ empty: true, size: 0, docs: [] }),
      };
      return query;
    },
  };
  const admin = {
    firestore: Object.assign(() => db, {
      FieldValue: {
        increment: (amount) => ({ operation: 'increment', amount }),
        serverTimestamp: () => 'server-time',
      },
    }),
  };
  const result = await moderateContent({
    admin,
    auth: {
      uid: 'admin-1',
      token: { admin: true, auth_time: Math.floor(Date.now() / 1000) },
    },
    data: { target, action: 'delete', reason: 'Confirmed policy violation' },
  });
  assert.equal(result.recovered, true);
  assert.equal(values.get(outboxPath).state, 'ready');
  assert.equal(values.get(outboxPath).readyVersion, 1);
});

test('user search supports an exact display name after UID lookup is not applicable', async () => {
  const profileQuery = {
    where: () => profileQuery,
    limit: () => profileQuery,
    get: async () => ({ empty: false, docs: [{ id: 'user-1' }] }),
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
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
      if (path === 'system/moderation/admins/admin-1') return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
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
    category: 'spam_scam_commercial',
    details: 'spam',
    createdAt: 'created',
    updatedAt: 'updated',
  });
  assert.equal('reporterId' in result, false);
  assert.equal(JSON.stringify(result).includes('report-1'), false);
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
        return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
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

test('admin-panel account deletion uses the shared resumable account deletion workflow', () => {
  const source = require('node:fs').readFileSync(require.resolve('./adminService'), 'utf8');
  const start = source.indexOf('async function deleteUserAsAdmin');
  const end = source.indexOf('async function listModerationAudit', start);
  const block = source.slice(start, end);
  assert.match(block, /deleteAccountInternal\(\{/);
  assert.doesNotMatch(block, /deleteOwnedContent|auth\(\)\.deleteUser|bucket\.deleteFiles/);
});
