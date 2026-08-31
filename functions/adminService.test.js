const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyingSuspensionDisposition,
  applySuspensionEnforcement,
  assertAdmin,
  assertManualContentRestoreAllowed,
  assertModerationRetryOperation,
  assertRecentAuth,
  assertTotpSecondFactor,
  cleanId,
  cleanOptionalId,
  directSuspensionEnforcementId,
  finalizeReinstatement,
  getAdminResource,
  getModerationDashboard,
  listAdminUsers,
  listHeldContent,
  listModerationAudit,
  listModerationCases,
  moderationCaseAuditId,
  moderationDeletionCanResumeFromOperation,
  moderationDecisionOptions,
  moderateContent,
  moderationOperationDocumentId,
  bulkUpdateModerationCases,
  updateModerationCase,
  sensitiveAdminActions,
  publicModerationCase,
  publicModerationReport,
  publicHoldContext,
  recoverablePreviousCaseStatus,
  reconcileStaleModerationDecisions,
  recoverApplyingSuspension,
  processExpiredModerationSuspensions,
  normalizeNoViolationContentAction,
  reinstateUserAccount,
  resolveModerationCase,
  searchAdminResources,
  setUserAdmin,
  setUserEmailVerified,
  suspensionReplayDisposition,
  updateAdminAttachedPlace,
} = require('./adminService');
const { ownerNotificationOutboxId } = require('./notificationService');

function recentTotpAdminToken(extra = {}) {
  return {
    admin: true,
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_second_factor: 'totp' },
    ...extra,
  };
}

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

test('state-changing admin operations require recent authentication and TOTP', () => {
  assert.doesNotThrow(() => assertRecentAuth({ token: { auth_time: Math.floor(Date.now() / 1000) } }));
  assert.throws(
    () => assertRecentAuth({ token: { auth_time: Math.floor(Date.now() / 1000) - 3600 } }),
    (error) => error.details?.reason === 'recent_sign_in_required'
  );
  assert.doesNotThrow(() => assertTotpSecondFactor({ token: { firebase: { sign_in_second_factor: 'totp' } } }));
  for (const secondFactor of [undefined, 'phone']) {
    assert.throws(
      () => assertTotpSecondFactor({ token: { firebase: { sign_in_second_factor: secondFactor } } }),
      (error) => error.details?.reason === 'totp_required'
    );
  }
});

test('sensitive-admin action list covers every state-changing admin operation', () => {
  const actions = sensitiveAdminActions();
  for (const action of [
    'updateModerationCase',
    'saveAdminSavedView',
    'deleteAdminSavedView',
    'moderateContent',
    'resolveModerationCase',
    'bulkUpdateModerationCases',
    'setUserSuspension',
    'setUserEmailVerified',
    'setUserAdmin',
    'deleteUserAsAdmin',
    'updateAdminAttachedPlace',
    'recheckDestination',
    'approveDestination',
    'selectDestinationImageCandidate',
    'setDestinationUploadedImage',
    'setDestinationAirport',
    'setDestinationHebrewName',
    'updateDestinationPolicy',
    'startDestinationReassignment',
    'deactivateDestination',
  ]) {
    assert.ok(actions[action]?.recentSignIn, `${action} must require a recent sign-in`);
  }
  assert.equal(typeof actions.deactivateDestination.reason, 'string');
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
    'getDestinationImageCandidates',
    'getAirportCandidates',
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

test('system-managed destination holds expose safe context and cannot be restored manually', () => {
  const content = {
    status: 'moderation_hold',
    moderation: {
      holdReason: 'destination_policy_review',
      systemGate: 'destination_pending_approval',
      destination: {
        countryId: 'IL',
        cityId: 'new-city',
        cityName: 'ניר דוד',
        countryName: 'ישראל',
        privateProviderPayload: 'must-not-leak',
      },
      actorUid: 'private-admin',
    },
  };

  assert.deepEqual(publicHoldContext(content), {
    kind: 'system',
    holdReason: 'destination_policy_review',
    systemGate: 'destination_pending_approval',
    destination: {
      countryId: 'IL',
      cityId: 'new-city',
      cityName: 'ניר דוד',
      countryName: 'ישראל',
    },
  });
  assert.throws(
    () => assertManualContentRestoreAllowed(content),
    (error) => error?.details?.reason === 'system_managed_hold'
  );
  assert.doesNotThrow(() => assertManualContentRestoreAllowed({
    status: 'moderation_hold',
    moderation: { holdReason: 'unsafe_text' },
  }));
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

test('held content pagination reaches every supported collection without duplicates', async () => {
  const records = {
    recommendations: Array.from({ length: 31 }, (_, index) => ({
      id: `rec-${String(index + 1).padStart(2, '0')}`,
      data: { status: 'moderation_hold', title: `Recommendation ${index + 1}` },
    })),
    routes: [
      { id: 'route-01', data: { status: 'moderation_hold', title: 'Route 1' } },
      { id: 'route-02', data: { status: 'moderation_hold', title: 'Route 2' } },
    ],
    trips: [{ id: 'trip-01', data: { status: 'moderation_hold', title: 'Trip 1' } }],
  };
  const db = {
    doc: () => ({ get: async () => ({ exists: true, data: () => ({ active: true }) }) }),
    collection(collectionName) {
      let after = '';
      let maximum = 30;
      const query = {
        where: () => query,
        orderBy: (field) => {
          assert.equal(field, '__name__');
          return query;
        },
        startAfter: (id) => {
          after = id;
          return query;
        },
        limit: (value) => {
          maximum = value;
          return query;
        },
        get: async () => ({
          docs: (records[collectionName] || [])
            .filter((record) => record.id > after)
            .slice(0, maximum)
            .map((record) => ({
              id: record.id,
              ref: { path: `${collectionName}/${record.id}` },
              data: () => record.data,
            })),
        }),
      };
      return query;
    },
  };
  const firestore = () => db;
  firestore.FieldPath = { documentId: () => '__name__' };
  const admin = { firestore };
  const auth = { uid: 'admin-1', token: { admin: true } };

  const first = await listHeldContent({ admin, auth, data: {} });
  assert.equal(first.items.length, 30);
  assert.equal(first.items[0].target.path, 'recommendations/rec-01');
  assert.equal(first.items.at(-1).target.path, 'recommendations/rec-30');
  assert.equal(first.nextCursor, 'recommendations:rec-30');

  const second = await listHeldContent({ admin, auth, data: { cursor: first.nextCursor } });
  assert.deepEqual(second.items.map((item) => item.target.path), [
    'recommendations/rec-31',
    'routes/route-01',
    'routes/route-02',
    'trips/trip-01',
  ]);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.target.path)).size, 34);
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
    auth: { uid: 'admin-1', token: recentTotpAdminToken() },
    data: { caseId: 'case-1', expectedRevision: 3, operation: 'claim' },
  }), (error) => error?.details?.reason === 'case_revision_conflict');
});

test('a report recorded during a lease does not cancel resolution finalization', async () => {
  const deleted = Symbol('deleted');
  const target = { type: 'recommendation', id: 'rec-1' };
  const operationId = 'operation-report-race-1';
  const operationPath = `system/moderation/operations/${moderationOperationDocumentId('case-1', operationId)}`;
  let operationValue = null;
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
      if (path === operationPath) return { path };
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
          reportCount: 2,
          reportRevision: 1,
        };
      }
      return handler({
        get: async (ref) => {
          if (ref.path === 'recommendations/rec-1') {
            return { exists: true, data: () => ({ status: 'active', ownerId: 'owner-1' }) };
          }
          if (ref.path.startsWith('system/moderation/audit/')) {
            return { exists: false, data: () => null };
          }
          if (ref.path === operationPath) {
            return { exists: Boolean(operationValue), data: () => operationValue };
          }
          assert.equal(ref.path, 'system/moderation/cases/case-1');
          return { exists: true, data: () => caseValue };
        },
        set: (ref, value) => {
          if (ref.path === 'system/moderation/cases/case-1') applyMerge(value);
          if (ref.path === operationPath) operationValue = { ...(operationValue || {}), ...value };
        },
      });
    },
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { delete: () => deleted, serverTimestamp: () => 'server-time' },
  });

  const result = await resolveModerationCase({
    admin: { firestore },
    auth: {
      uid: 'admin-1',
      token: recentTotpAdminToken({ name: 'מנהלת' }),
    },
    data: {
      caseId: 'case-1',
      expectedRevision: 3,
      contentAction: 'dismiss',
      accountAction: { type: 'none' },
      reasonCode: 'no_violation',
      operationId,
    },
  });
  assert.equal(result.status, 'resolved_dismissed');
  assert.equal(caseValue.status, 'resolved_dismissed');
  assert.equal(caseValue.revision, 5);
  assert.equal(caseValue.decisionRevision, 5);
  assert.equal(caseValue.reportRevision, 1);
  assert.equal(caseValue.reportCount, 2);
  assert.equal(caseValue.decisionLease, undefined);
  assert.equal(operationValue.stage, 'case_finalized');
});

test('a completed case decision and its audit replay once after a lost response', async () => {
  const deleted = Symbol('deleted');
  const target = {
    type: 'destination',
    id: 'haifa',
    countryId: 'IL',
    cityId: 'haifa',
    path: 'countries/IL/destinations/haifa',
  };
  let caseValue = { target, targetPreview: { available: true, title: 'חיפה' }, revision: 0, status: 'open' };
  const auditValues = new Map();
  let auditWrites = 0;
  const operationId = 'operation-replay-1';
  const operationPath = `system/moderation/operations/${moderationOperationDocumentId('case-1', operationId)}`;
  let operationValue = null;
  let eventCounter = 0;
  const merge = (current, patch) => Object.fromEntries(Object.entries({ ...current, ...patch })
    .filter(([, value]) => value !== deleted));
  const db = {
    doc(path) {
      return {
        path,
        get: async () => {
          if (path === 'system/moderation/admins/admin-1') {
            return { exists: true, data: () => ({ active: true }) };
          }
          if (path === 'system/moderation/cases/case-1') {
            return { exists: true, data: () => caseValue };
          }
          return { exists: false, data: () => null };
        },
      };
    },
    collection(path) {
      return { doc: () => ({ path: `${path}/event-${eventCounter += 1}` }) };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        if (ref.path === 'system/moderation/cases/case-1') {
          return { exists: true, data: () => caseValue };
        }
        if (ref.path.startsWith('system/moderation/audit/')) {
          return {
            exists: auditValues.has(ref.path),
            data: () => auditValues.get(ref.path),
          };
        }
        if (ref.path === operationPath) {
          return { exists: Boolean(operationValue), data: () => operationValue };
        }
        throw new Error(`Unexpected transaction read: ${ref.path}`);
      },
      set: (ref, value) => {
        if (ref.path === 'system/moderation/cases/case-1') caseValue = merge(caseValue, value);
        else if (ref.path.startsWith('system/moderation/audit/')) {
          auditValues.set(ref.path, value);
          auditWrites += 1;
        }
        else if (ref.path === operationPath) operationValue = merge(operationValue || {}, value);
      },
    }),
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { delete: () => deleted, serverTimestamp: () => 'server-time' },
  });
  const request = {
    admin: { firestore },
    auth: {
      uid: 'admin-1',
      token: recentTotpAdminToken({ name: 'מנהלת' }),
    },
    data: {
      caseId: 'case-1',
      expectedRevision: 0,
      contentAction: 'dismiss',
      accountAction: { type: 'none' },
      reasonCode: 'no_violation',
      operationId,
    },
  };

  const first = await resolveModerationCase(request);
  const replay = await resolveModerationCase(request);
  assert.equal(first.status, 'resolved_dismissed');
  assert.equal(replay.status, 'resolved_dismissed');
  assert.equal(caseValue.revision, 2);
  assert.equal(auditWrites, 1);
  assert.equal(auditValues.size, 1);
  assert.equal(operationValue.stage, 'case_finalized');
});

test('held no-violation decisions restore content for current and legacy clients', () => {
  assert.equal(normalizeNoViolationContentAction({
    requestedContentAction: 'dismiss',
    contentStatus: 'moderation_hold',
  }), 'restore');
  assert.equal(normalizeNoViolationContentAction({
    requestedContentAction: 'dismiss',
    contentStatus: 'active',
  }), 'dismiss');
  const held = moderationDecisionOptions({
    target: { type: 'recommendation', id: 'rec-1' },
    targetPreview: { available: true, status: 'moderation_hold' },
    subjectUser: { uid: 'owner-1', status: 'active' },
  });
  assert.deepEqual(held.contentActions, ['none', 'restore', 'delete']);
  assert.equal(held.defaultContentAction, 'restore');
  assert.deepEqual(held.accountActions, ['none', 'warn', 'suspend']);
});

test('suspended content exposes an explicit reinstate and restore path', () => {
  const suspended = moderationDecisionOptions({
    target: { type: 'route', id: 'route-1' },
    targetPreview: { available: true, status: 'suspended' },
    subjectUser: { uid: 'owner-1', status: 'suspended' },
  });
  assert.deepEqual(suspended.contentActions, ['none', 'restore', 'delete']);
  assert.equal(suspended.defaultContentAction, 'restore');
  assert.deepEqual(suspended.accountActions, ['none', 'reinstate']);
  assert.equal(suspended.defaultAccountAction, 'none');
});

test('suspension replays only active or applying records and rejects every terminal state', () => {
  assert.equal(suspensionReplayDisposition('active'), 'replay');
  assert.equal(suspensionReplayDisposition('applying'), 'resume');
  for (const status of ['complete', 'revoked', 'superseded', 'failed', 'unknown']) {
    assert.equal(suspensionReplayDisposition(status), 'conflict');
  }
});

test('applying suspension recovery stops on mismatched history and classifies safe convergence paths', () => {
  const base = {
    enforcementId: 'enforcement-1',
    enforcement: {
      type: 'suspension', status: 'applying', userUid: 'user-1', stage: 'auth_disabled',
      authDisabledBefore: false, authDisableIntent: 'disable_for_suspension',
      authDisableStartedAt: 10, endsAt: 500,
    },
    userExists: true,
    authUser: { uid: 'user-1', disabled: true, customClaims: {} },
    intended: true,
    now: 100,
  };
  assert.equal(applyingSuspensionDisposition({
    ...base,
    userData: { moderation: { status: 'active' } },
  }).action, 'resume');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    now: 600,
    userData: { moderation: { status: 'active' } },
  }).action, 'expire_before_activation');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    enforcement: { ...base.enforcement, stage: 'effects_applied' },
    now: 600,
    userData: { moderation: { status: 'active' } },
  }).action, 'ambiguous');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    userData: { moderation: { status: 'suspended', enforcementId: 'newer' } },
  }).action, 'supersede');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    userData: { moderation: { status: 'suspended', enforcementId: 'enforcement-1' } },
  }).action, 'resume');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    intended: false,
    userData: { moderation: { status: 'active' } },
  }).action, 'cancel_before_activation');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    authUser: { ...base.authUser, customClaims: { admin: true } },
    userData: { moderation: { status: 'active' } },
  }).action, 'cancel_before_activation');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    intended: false,
    enforcement: { ...base.enforcement, stage: 'profile_suspended' },
    userData: { moderation: { status: 'suspended', enforcementId: 'enforcement-1' } },
  }).action, 'ambiguous');
  assert.equal(applyingSuspensionDisposition({
    ...base,
    intended: false,
    enforcement: { ...base.enforcement, authDisableStartedAt: null },
    userData: { moderation: { status: 'active' } },
  }).reason, 'auth_disable_origin_ambiguous');
});

test('canceling a pre-profile applying suspension re-enables an account disabled by that attempt', async () => {
  const writes = [];
  const authUpdates = [];
  const firestore = () => ({
    doc: (path) => ({
      get: async () => {
        if (path === 'users/user-1') return { exists: true, data: () => ({ moderation: { status: 'active' } }) };
        return { exists: false, data: () => null };
      },
    }),
  });
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const result = await recoverApplyingSuspension({
    admin: {
      firestore,
      auth: () => ({
        getUser: async () => ({ uid: 'user-1', disabled: true, customClaims: {} }),
        updateUser: async (uid, value) => authUpdates.push({ uid, value }),
        revokeRefreshTokens: async () => {},
      }),
    },
    enforcementEntry: {
      id: 'enforcement-1',
      data: () => ({
        type: 'suspension',
        status: 'applying',
        userUid: 'user-1',
        sourceCaseId: 'case-replaced',
        stage: 'auth_disabled',
        authDisabledBefore: false,
        authDisableIntent: 'disable_for_suspension',
        authDisableStartedAt: 10,
      }),
      ref: { set: async (value) => writes.push(value) },
    },
    mediaBucket: 'bucket',
  });
  assert.equal(result.superseded, true);
  assert.deepEqual(authUpdates, [{ uid: 'user-1', value: { disabled: false } }]);
  assert.equal(writes[0].stage, 'cancel_before_activation');
  assert.equal(writes[0].recoveryReason, 'decision_replaced');
});

test('applying suspension recovery never resumes over a newer enforcement', async () => {
  const writes = [];
  const enforcementEntry = {
    id: 'old-enforcement',
    data: () => ({
      type: 'suspension', status: 'applying', userUid: 'user-1', stage: 'auth_disabled', permanent: true,
    }),
    ref: { set: async (value) => writes.push(value) },
  };
  const firestore = () => ({
    doc: (path) => ({
      get: async () => {
        assert.equal(path, 'users/user-1');
        return {
          exists: true,
          data: () => ({ moderation: { status: 'suspended', enforcementId: 'newer-enforcement' } }),
        };
      },
    }),
  });
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const result = await recoverApplyingSuspension({
    admin: {
      firestore,
      auth: () => ({ getUser: async () => ({ uid: 'user-1', disabled: true, customClaims: {} }) }),
    },
    enforcementEntry,
    mediaBucket: 'bucket',
    applySuspensionEnforcementImpl: async () => assert.fail('a superseded enforcement must not resume'),
  });
  assert.equal(result.superseded, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].status, 'superseded');
  assert.equal(writes[0].recoveryReason, 'newer_enforcement');
});

test('ambiguous applying suspension history stops without any write', async () => {
  let writes = 0;
  const firestore = () => ({
    doc: () => ({
      get: async () => ({ exists: true, data: () => ({ moderation: { status: 'active' } }) }),
    }),
  });
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const result = await recoverApplyingSuspension({
    admin: {
      firestore,
      auth: () => ({ getUser: async () => ({ uid: 'user-1', disabled: true, customClaims: {} }) }),
    },
    enforcementEntry: {
      id: 'uncertain',
      data: () => ({
        type: 'suspension',
        status: 'applying',
        userUid: 'user-1',
        stage: 'effects_applied',
        endsAt: 50,
      }),
      ref: { set: async () => { writes += 1; } },
    },
    mediaBucket: 'bucket',
    now: 100,
  });
  assert.equal(result.ambiguous, true);
  assert.equal(writes, 0);
});

test('a suspension retry converges after failure at every durable stage', async () => {
  const failurePoints = [
    'auth_disabling',
    'auth_update',
    'auth_disabled',
    'profile_update',
    'profile_suspended',
    'media',
    'hide',
    'effects_applied',
    'notification',
    'audit',
    'complete',
  ];
  for (const failurePoint of failurePoints) {
    let injected = false;
    const state = {};
    const failOnce = (point) => {
      if (!injected && failurePoint === point) {
        injected = true;
        throw new Error(`injected:${point}`);
      }
    };
    const enforcementRef = {
      set: async (value) => {
        failOnce(value.stage);
        Object.assign(state, value);
      },
    };
    const firestore = () => ({
      doc: (path) => path === 'users/user-1'
        ? {
            update: async () => failOnce('profile_update'),
            get: async () => ({ exists: true, data: () => ({ displayName: 'משתמש' }) }),
          }
        : { delete: async () => {} },
    });
    firestore.FieldValue = {
      serverTimestamp: () => 'server-time',
      delete: () => 'delete',
    };
    const admin = {
      firestore,
      auth: () => ({
        updateUser: async () => failOnce('auth_update'),
        revokeRefreshTokens: async () => {},
      }),
    };
    const invoke = () => applySuspensionEnforcement({
      admin,
      auth: { uid: 'admin-1', token: { name: 'מנהלת' } },
      user: { uid: 'user-1' },
      mediaBucket: 'bucket',
      enforcementId: 'enforcement-1',
      enforcementRef,
      endsAt: 1000,
      durationHours: 24,
      reason: 'סיבה',
      userMessage: 'הודעה',
      setMediaAvailabilityImpl: async () => failOnce('media'),
      hideUserContentImpl: async () => {
        failOnce('hide');
        return 3;
      },
      sendModerationNotificationImpl: async () => failOnce('notification'),
      auditEnforcementOnceImpl: async () => failOnce('audit'),
    });
    await assert.rejects(invoke(), new RegExp(`injected:${failurePoint}`));
    const result = await invoke();
    assert.equal(result.suspended, true);
    assert.equal(result.hidden, 3);
    assert.equal(state.status, 'active');
    assert.equal(state.stage, 'complete');
  }
});

test('moderation case audits use a stable operation-scoped identifier', () => {
  const first = moderationCaseAuditId('case-1', 'operation-1');
  assert.equal(first, moderationCaseAuditId('case-1', 'operation-1'));
  assert.notEqual(first, moderationCaseAuditId('case-1', 'operation-2'));
  assert.match(first, /^case_[A-Za-z0-9_-]{40}$/);
});

test('direct suspension operations derive a stable per-user enforcement identifier', () => {
  const first = directSuspensionEnforcementId('user-1', 'operation-1');
  assert.equal(first, directSuspensionEnforcementId('user-1', 'operation-1'));
  assert.notEqual(first, directSuspensionEnforcementId('user-1', 'operation-2'));
  assert.notEqual(first, directSuspensionEnforcementId('user-2', 'operation-1'));
  assert.match(first, /^[A-Za-z0-9_-]{40}$/);
});

test('a stale resolving lease recovers the queue status used before the operation', () => {
  assert.equal(recoverablePreviousCaseStatus({
    status: 'resolving',
    decisionLease: { previousStatus: 'auto_held' },
  }), 'auto_held');
  assert.equal(recoverablePreviousCaseStatus({
    status: 'resolving',
    targetPreview: { status: 'moderation_hold' },
  }), 'auto_held');
  assert.equal(recoverablePreviousCaseStatus({ status: 'resolving' }), 'open');
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
    auth: { uid: 'admin-1', token: recentTotpAdminToken() },
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
    auth: { uid: 'admin-1', token: recentTotpAdminToken() },
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
  const enforcementQuery = () => {
    let status = '';
    const query = {
      where: (field, _operator, value) => {
        if (field === 'status') status = value;
        return query;
      },
      orderBy: () => query,
      limit: () => query,
      get: async () => status === 'applying'
        ? ({ size: 0, docs: [] })
        : ({ size: docs.length, docs }),
    };
    return query;
  };
  const db = {
    collection: () => enforcementQuery(),
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
  const result = await processExpiredModerationSuspensions({
    admin: { firestore },
    mediaBucket: 'bucket',
    now: 123,
    reinstateImpl: async ({ uid, expectedEnforcementId, requireExpired, now }) => {
      reinstated.push([uid, expectedEnforcementId, requireExpired, now]);
      return { reinstated: true };
    },
  });
  assert.deepEqual(result, {
    scanned: 2,
    reinstated: 1,
    superseded: 1,
    applyingScanned: 0,
    applyingRecovered: 0,
    applyingSuperseded: 0,
    applyingAmbiguous: 0,
    applyingFailed: 0,
  });
  assert.deepEqual(reinstated, [['user-current', 'current', true, 123]]);
  assert.equal(writes.find(([id]) => id === 'stale')[1].status, 'superseded');
});

test('scheduled moderation recovery processes stale applying records independently', async () => {
  const applyingDocs = [
    { id: 'resume', data: () => ({ userUid: 'user-resume' }) },
    { id: 'expired', data: () => ({ userUid: 'user-expired' }) },
    { id: 'ambiguous', data: () => ({ userUid: 'user-ambiguous' }) },
  ];
  const queryFor = () => {
    let status = '';
    const query = {
      where: (field, _operator, value) => {
        if (field === 'status') status = value;
        return query;
      },
      orderBy: () => query,
      limit: () => query,
      get: async () => status === 'applying'
        ? ({ size: applyingDocs.length, docs: applyingDocs })
        : ({ size: 0, docs: [] }),
    };
    return query;
  };
  const firestore = () => ({ collection: () => queryFor() });
  firestore.Timestamp = { fromMillis: (value) => value };
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const result = await processExpiredModerationSuspensions({
    admin: { firestore },
    mediaBucket: 'bucket',
    now: 1000,
    recoverApplyingImpl: async ({ enforcementEntry }) => {
      if (enforcementEntry.id === 'resume') return { recovered: true, resumed: true };
      if (enforcementEntry.id === 'expired') return { recovered: true, reinstated: true };
      return { recovered: false, ambiguous: true };
    },
  });
  assert.deepEqual(result, {
    scanned: 0,
    reinstated: 0,
    superseded: 0,
    applyingScanned: 3,
    applyingRecovered: 2,
    applyingSuperseded: 0,
    applyingAmbiguous: 1,
    applyingFailed: 0,
  });
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
      enforcement: { authDisabledBefore: false, authDisableIntent: 'disable_for_suspension' },
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
      enforcement: { authDisabledBefore: false, authDisableIntent: 'disable_for_suspension' },
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
    authPreservedDisabled: false,
  });
  assert.deepEqual(authStates, [false]);
});

test('a failed moderation decision can only resume with its recorded operation id', () => {
  const retry = {
    operationId: 'operation-original',
    contentAction: 'delete',
    accountAction: 'none',
  };
  assert.doesNotThrow(() => assertModerationRetryOperation(retry, 'operation-original'));
  assert.throws(
    () => assertModerationRetryOperation(retry, 'operation-conflicting'),
    (error) => error?.details?.reason === 'decision_retry_conflict'
  );
});

test('a deleted moderation target resumes only from the same proven delete operation', () => {
  const target = { type: 'recommendation', id: 'rec-1', path: 'recommendations/rec-1' };
  const operation = {
    caseId: 'case-1',
    operationId: 'operation-delete-1',
    target,
    requestedContentAction: 'delete',
    contentAction: 'delete',
    accountAction: 'none',
    stage: 'effects_applied',
  };
  const input = {
    caseId: 'case-1',
    operationId: 'operation-delete-1',
    target,
    requestedContentAction: 'delete',
    accountAction: 'none',
  };
  assert.equal(moderationDeletionCanResumeFromOperation(operation, input), true);
  assert.equal(moderationDeletionCanResumeFromOperation(operation, {
    ...input,
    operationId: 'operation-conflicting',
  }), false);
  assert.equal(moderationDeletionCanResumeFromOperation({ ...operation, stage: 'started' }, input), false);
  assert.equal(moderationDeletionCanResumeFromOperation(operation, {
    ...input,
    requestedContentAction: 'restore',
  }), false);
});

test('scheduled reconciliation releases a stale moderation decision lease for retry', async () => {
  const deleted = Symbol('deleted');
  let caseValue = {
    status: 'resolving',
    revision: 7,
    decisionRevision: 7,
    decisionLease: { previousStatus: 'auto_held', startedAtMs: 1 },
  };
  const caseRef = { id: 'case-1', path: 'system/moderation/cases/case-1' };
  const caseEntry = { id: 'case-1', ref: caseRef, data: () => caseValue };
  const db = {
    doc: (path) => ({ path }),
    collection(path) {
      if (path === 'system/moderation/cases') {
        const query = {
          where: () => query,
          limit: () => query,
          get: async () => ({ size: 1, docs: [caseEntry] }),
        };
        return query;
      }
      return { doc: () => ({ path: `${path}/event-1` }) };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => ({ exists: true, data: () => caseValue, ref }),
      set: (ref, patch) => {
        if (ref.path !== caseRef.path) return;
        caseValue = Object.fromEntries(Object.entries({ ...caseValue, ...patch })
          .filter(([, value]) => value !== deleted));
      },
    }),
  };
  const firestore = Object.assign(() => db, {
    FieldValue: { delete: () => deleted, serverTimestamp: () => 'server-time' },
  });
  const result = await reconcileStaleModerationDecisions({
    admin: { firestore },
    now: 1_000_000,
  });
  assert.deepEqual(result, { scanned: 1, recovered: 1, fresh: 0, invalid: 1 });
  assert.equal(caseValue.status, 'auto_held');
  assert.equal(caseValue.revision, 8);
  assert.equal(caseValue.decisionRevision, 8);
  assert.equal(caseValue.decisionLease, undefined);
  assert.equal(caseValue.resolutionError, 'stale_decision_lease');
});

test('reinstatement preserves an Auth account that was disabled before PlanLi suspension', async () => {
  const authStates = [];
  const result = await reinstateUserAccount({
    admin: {
      auth: () => ({
        updateUser: async (_uid, value) => authStates.push(value.disabled),
        revokeRefreshTokens: async () => assert.fail('preserved disabled Auth state needs no token mutation'),
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
      enforcement: { authDisabledBefore: true, authDisableIntent: 'preserve_disabled' },
    }),
    setMediaAvailabilityImpl: async ({ available }) => assert.equal(available, true),
    finalizeReinstatementImpl: async () => true,
    releaseModerationTransitionImpl: async () => {},
  });
  assert.equal(result.reinstated, true);
  assert.equal(result.authPreservedDisabled, true);
  assert.deepEqual(authStates, []);
});

test('reinstatement finalizes account, enforcement, profile, notification, and audit atomically', async () => {
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
  assert(writes.some(([kind, path, value]) => kind === 'set'
    && path.startsWith('system/moderation/audit/reinstatement_')
    && value.action === 'user_suspension_expired'
    && value.metadata.enforcementId === 'enforcement-1'));
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
      auth: { uid: 'admin-a', token: { ...recentTotpAdminToken(), auth_time: recent } },
      data: { identifier: 'admin-b', admin: false, reason: 'בדיקת הרשאות' },
    }),
    setUserAdmin({
      admin,
      auth: { uid: 'admin-b', token: { ...recentTotpAdminToken(), auth_time: recent } },
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
      token: recentTotpAdminToken(),
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

test('admin Firestore pagination rejects cursors that change document paths', async () => {
  const query = {
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
  };
  const db = {
    doc(path) {
      if (path === 'system/moderation/admins/admin-1') {
        return { get: async () => ({ exists: true, data: () => ({ active: true }) }) };
      }
      throw new Error(`Unexpected Firestore path: ${path}`);
    },
    collection: () => query,
  };
  const invocation = { admin: { firestore: () => db }, auth: { uid: 'admin-1', token: { admin: true } } };

  for (const operation of [listModerationCases, searchAdminResources, listModerationAudit]) {
    await assert.rejects(
      operation({ ...invocation, data: { cursor: 'parent/nested' } }),
      (error) => error.details?.reason === 'invalid_input'
    );
  }
});

test('Firestore document IDs reject nested paths, dot segments, controls and excess length', () => {
  for (const value of [
    'parent/nested', '.', '..', `case\u0085id`, 'case-1\n', '\tcase-1', 'x'.repeat(181),
  ]) {
    assert.throws(
      () => cleanId(value, 'caseId'),
      (error) => error.details?.reason === 'invalid_input'
    );
    assert.throws(
      () => cleanOptionalId(value, 'sourceCaseId'),
      (error) => error.details?.reason === 'invalid_input'
    );
  }
  assert.equal(cleanOptionalId(undefined, 'caseId'), '');
  assert.equal(cleanId('case-1', 'caseId'), 'case-1');
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
    auth: { uid: 'admin-1', token: recentTotpAdminToken({ name: 'מנהלת' }) },
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
      auth: { uid: 'admin-1', token: recentTotpAdminToken() },
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
      token: recentTotpAdminToken(),
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
  const caseId = 'case-1';
  const operationId = 'operation-delete-retry-1';
  const operationPath = `system/moderation/operations/${moderationOperationDocumentId(caseId, operationId)}`;
  const outboxId = ownerNotificationOutboxId('content_deleted', targetPath);
  const outboxPath = `system/moderation/ownerNotifications/${outboxId}`;
  const values = new Map([[`system/moderation/cases/${caseId}`, {
    target: { ...target, path: targetPath },
    status: 'resolving',
    revision: 1,
    decisionRevision: 1,
    decisionLease: { operationId },
  }], [operationPath, {
    caseId,
    operationId,
    target: { ...target, path: targetPath },
    requestedContentAction: 'delete',
    contentAction: 'delete',
    accountAction: 'none',
    stage: 'target_deleted',
  }], [outboxPath, {
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
      token: recentTotpAdminToken(),
    },
    data: {
      caseId,
      operationId,
      target,
      action: 'delete',
      reason: 'Confirmed policy violation',
    },
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
      auth: { uid: 'admin-1', token: recentTotpAdminToken() },
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
