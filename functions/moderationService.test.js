const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REPORT_CATEGORIES,
  buildAdminNotificationProjection,
  buildHeldMediaProjection,
  caseIdForPath,
  caseStatusForReport,
  evaluateTextSafety,
  handleModerationCaseNotificationWrite,
  normalizeReportInput,
  normalizeReportTarget,
  setBlockedUser,
  submitReport,
} = require('./moderationService');

test('normalizes every supported moderation target to a canonical path', () => {
  assert.deepEqual(normalizeReportTarget({ type: 'recommendation', id: 'rec-1' }), {
    type: 'recommendation', id: 'rec-1', path: 'recommendations/rec-1',
  });
  assert.deepEqual(normalizeReportTarget({
    type: 'comment', parentType: 'route', parentId: 'route-1', id: 'comment-1',
  }), {
    type: 'comment', parentType: 'route', parentId: 'route-1', id: 'comment-1',
    path: 'routes/route-1/comments/comment-1',
  });
  assert.equal(normalizeReportTarget({ type: 'profile', id: 'user-1' }).path, 'publicProfiles/user-1');
});

test('requires useful details for accuracy, rights and other reports', () => {
  for (const category of ['inaccurate_or_unsafe_travel_info', 'copyright_image_rights', 'other']) {
    assert.throws(() => normalizeReportInput({
      target: { type: 'trip', id: 'trip-1' }, category, details: '',
    }), (error) => error.details?.reason === 'details_required');
  }
  assert.equal(REPORT_CATEGORIES.length, 10);
});

test('case ids are stable and do not expose the target path', () => {
  const first = caseIdForPath('recommendations/abc');
  assert.equal(first, caseIdForPath('recommendations/abc'));
  assert.notEqual(first, caseIdForPath('recommendations/def'));
  assert.equal(first.includes('recommendations'), false);
});

test('a new report reopens resolved cases while preserving unresolved states', () => {
  assert.equal(caseStatusForReport('resolved_dismissed', false), 'open');
  assert.equal(caseStatusForReport('resolved_deleted', false), 'open');
  assert.equal(caseStatusForReport('open', false), 'open');
  assert.equal(caseStatusForReport('auto_held', false), 'auto_held');
  assert.equal(caseStatusForReport('open', true), 'auto_held');
});

test('admin notification projections version unique reports, escalations, and reopenings safely', () => {
  const target = {
    type: 'recommendation',
    id: 'rec-1',
    path: 'recommendations/rec-1',
    title: 'Safe preview',
    thumbUrls: ['https://example.com/thumb.jpg'],
  };
  const first = buildAdminNotificationProjection({
    previous: null,
    newReport: true,
    urgentEscalated: false,
    reopening: false,
    priority: 'normal',
    reportCount: 1,
    target,
    occurredAt: 'time-1',
    reporterId: 'must-not-persist',
    details: 'must-not-persist',
  });
  assert.deepEqual(Object.keys(first).sort(), [
    'count', 'occurredAt', 'priority', 'schemaVersion', 'subtype', 'target', 'version',
  ]);
  assert.equal(first.version, 1);
  assert.equal(first.subtype, 'report_received');
  assert.equal(JSON.stringify(first).includes('must-not-persist'), false);
  assert.equal(buildAdminNotificationProjection({
    previous: first,
    newReport: false,
    urgentEscalated: false,
    reopening: false,
    priority: 'normal',
    reportCount: 1,
    target,
    occurredAt: 'time-2',
  }), null);

  const escalated = buildAdminNotificationProjection({
    previous: first,
    newReport: false,
    urgentEscalated: true,
    reopening: false,
    priority: 'urgent',
    reportCount: 1,
    target,
    occurredAt: 'time-2',
  });
  assert.equal(escalated.version, 2);
  assert.equal(escalated.subtype, 'urgent_escalation');
  const reopened = buildAdminNotificationProjection({
    previous: escalated,
    newReport: false,
    urgentEscalated: false,
    reopening: true,
    priority: 'urgent',
    reportCount: 1,
    target,
    occurredAt: 'time-3',
  });
  assert.equal(reopened.version, 3);
  assert.equal(reopened.subtype, 'report_received');
  assert.doesNotMatch(submitReport.toString(), /fanoutAdminNotification/u);
});

test('moderation case writes fan out only newer projection versions', async () => {
  const target = {
    type: 'route', id: 'route-1', path: 'routes/route-1', title: 'Route', thumbUrls: [],
  };
  const beforeProjection = buildAdminNotificationProjection({
    previous: null,
    newReport: true,
    urgentEscalated: false,
    reopening: false,
    priority: 'normal',
    reportCount: 1,
    target,
    occurredAt: 'time-1',
  });
  const afterProjection = buildAdminNotificationProjection({
    previous: beforeProjection,
    newReport: true,
    urgentEscalated: true,
    reopening: false,
    priority: 'urgent',
    reportCount: 2,
    target,
    occurredAt: 'time-2',
  });
  let fanoutInput;
  const event = {
    params: { caseId: 'case-1' },
    data: {
      before: { exists: true, data: () => ({ adminNotification: beforeProjection }) },
      after: { exists: true, data: () => ({ adminNotification: afterProjection }) },
    },
  };
  const result = await handleModerationCaseNotificationWrite({
    admin: {},
    event,
    fanoutAdminNotificationImpl: async (input) => {
      fanoutInput = input;
      return [{}, {}];
    },
  });
  assert.deepEqual(result, { status: 'fanout', version: 2, deliveries: 2 });
  assert.equal(fanoutInput.activityVersion, 2);
  assert.equal(fanoutInput.notification.priority, 'urgent');
  assert.equal(fanoutInput.notification.count, 2);
  assert.deepEqual(fanoutInput.notification.navigation, {
    action: 'open_moderation_case', caseId: 'case-1',
  });

  const ignored = await handleModerationCaseNotificationWrite({
    admin: {},
    event: {
      ...event,
      data: {
        before: { exists: true, data: () => ({ adminNotification: afterProjection }) },
        after: { exists: true, data: () => ({ adminNotification: afterProjection }) },
      },
    },
    fanoutAdminNotificationImpl: async () => { throw new Error('must not fan out'); },
  });
  assert.deepEqual(ignored, { status: 'ignored', reason: 'no_new_admin_notification' });
});

test('auto-hold media projection is sanitized and retried with case fanout', async () => {
  const assetId = '123e4567-e89b-42d3-a456-426614174000';
  const mediaProjection = buildHeldMediaProjection({
    previous: null,
    data: {
      media: [{
        assetId,
        large: {
          path: `media/owner-1/${assetId}/large.webp`,
          url: 'https://private.example/token',
        },
        feed: { path: 'not-a-canonical-path' },
      }],
      privateText: 'must-not-persist',
    },
    occurredAt: 'time-1',
  });
  assert.deepEqual(mediaProjection.assets, [{
    assetId,
    large: { path: `media/owner-1/${assetId}/large.webp` },
  }]);
  assert.equal(JSON.stringify(mediaProjection).includes('private.example'), false);
  assert.equal(JSON.stringify(mediaProjection).includes('must-not-persist'), false);

  const target = { type: 'trip', id: 'trip-1', path: 'trips/trip-1' };
  const adminProjection = buildAdminNotificationProjection({
    previous: null,
    newReport: true,
    urgentEscalated: false,
    reopening: false,
    priority: 'normal',
    reportCount: 3,
    target,
    occurredAt: 'time-1',
  });
  const event = {
    params: { caseId: 'case-1' },
    data: {
      before: { exists: true, data: () => ({}) },
      after: {
        exists: true,
        data: () => ({
          adminNotification: adminProjection,
          mediaModeration: mediaProjection,
          target,
        }),
      },
    },
  };
  let mediaAttempts = 0;
  let fanoutAttempts = 0;
  const invoke = () => handleModerationCaseNotificationWrite({
    admin: {},
    event,
    mediaBucket: 'media-eu',
    resolveCurrentModerationStateImpl: async () => ({
      caseData: { mediaModeration: mediaProjection },
      targetData: { status: 'moderation_hold' },
    }),
    setMediaAvailabilityImpl: async (input) => {
      mediaAttempts += 1;
      assert.equal(input.mediaBucket, 'media-eu');
      assert.equal(input.available, false);
      assert.equal(input.reason, 'community_reports');
      assert.deepEqual(input.data, { media: mediaProjection.assets });
      if (mediaAttempts === 1) throw new Error('transient media failure');
    },
    fanoutAdminNotificationImpl: async () => {
      fanoutAttempts += 1;
      return [{}];
    },
  });
  await assert.rejects(invoke(), /transient media failure/u);
  assert.deepEqual(await invoke(), {
    status: 'fanout', version: 1, deliveries: 1, mediaVersion: 1,
  });
  assert.equal(mediaAttempts, 2);
  assert.equal(fanoutAttempts, 2);
});

test('a delayed auto-hold event cannot hide media after content is restored', async () => {
  const mediaProjection = {
    schemaVersion: 1,
    version: 3,
    available: false,
    assets: [],
  };
  let mediaWrites = 0;
  const result = await handleModerationCaseNotificationWrite({
    admin: {},
    event: {
      params: { caseId: 'case-1' },
      data: {
        before: { exists: true, data: () => ({ mediaModeration: { version: 2 } }) },
        after: { exists: true, data: () => ({
          target: { path: 'recommendations/post-1' },
          mediaModeration: mediaProjection,
        }) },
      },
    },
    resolveCurrentModerationStateImpl: async () => ({
      caseData: { mediaModeration: mediaProjection },
      targetData: { status: 'active' },
    }),
    setMediaAvailabilityImpl: async () => { mediaWrites += 1; },
  });
  assert.equal(result.status, 'media_updated');
  assert.equal(mediaWrites, 0);
});

test('text safety detects explicit severe and suspicious terms in Hebrew and English', () => {
  assert.equal(evaluateTextSafety('מסלול משפחתי ליד הים').safe, true);
  assert.equal(evaluateTextSafety('שלחו לי וואטסאפ לרווח מובטח').severity, 'suspicious');
  assert.equal(evaluateTextSafety('child porn').severity, 'severe');
});

test('blocking requires an active public target and enforces the per-user cap transactionally', async () => {
  const makeAdmin = ({ targetExists = true, targetStatus = 'active', count = 0 } = {}) => {
    const writes = [];
    const db = {
      doc(path) {
        return { path };
      },
      runTransaction: async (handler) => handler({
        get: async (ref) => {
          if (ref.path === 'publicProfiles/target-1') {
            return { exists: targetExists, data: () => ({ status: targetStatus }) };
          }
          if (ref.path.endsWith('/serverState/moderation')) {
            return { exists: true, data: () => ({ blockedUserCount: count }) };
          }
          return { exists: false, data: () => null };
        },
        set: (ref, value, options) => writes.push({ type: 'set', path: ref.path, value, options }),
        delete: (ref) => writes.push({ type: 'delete', path: ref.path }),
      }),
    };
    return {
      admin: {
        firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'time' } }),
      },
      writes,
    };
  };

  await assert.rejects(setBlockedUser({
    admin: makeAdmin({ targetExists: false }).admin,
    auth: { uid: 'user-1' },
    data: { blockedUid: 'target-1', blocked: true },
  }), (error) => error?.details?.reason === 'block_target_missing');
  await assert.rejects(setBlockedUser({
    admin: makeAdmin({ count: 250 }).admin,
    auth: { uid: 'user-1' },
    data: { blockedUid: 'target-1', blocked: true },
  }), (error) => error?.details?.reason === 'block_limit_reached');

  const fixture = makeAdmin({ count: 249 });
  await setBlockedUser({
    admin: fixture.admin,
    auth: { uid: 'user-1' },
    data: { blockedUid: 'target-1', blocked: true },
    purgeNotificationsForActorForRecipientImpl: async () => 0,
    detachBlockedActorLikeContributionsImpl: async () => 0,
  });
  assert(fixture.writes.some((entry) => entry.path === 'users/user-1/blockedUsers/target-1'));
  assert(fixture.writes.some((entry) => entry.value?.blockedUserCount === 250));
});

test('unblocking deletes the blockedUser document and decrements the count', async () => {
  const writes = [];
  const db = {
    doc(path) {
      return { path };
    },
    runTransaction: async (handler) => handler({
      get: async (ref) => {
        if (ref.path === 'users/user-1/blockedUsers/target-1') {
          return { exists: true, data: () => ({ blockedUid: 'target-1' }) };
        }
        if (ref.path.endsWith('/serverState/moderation')) {
          return { exists: true, data: () => ({ blockedUserCount: 2 }) };
        }
        return { exists: false, data: () => null };
      },
      set: (ref, value, options) => writes.push({ type: 'set', path: ref.path, value, options }),
      delete: (ref) => writes.push({ type: 'delete', path: ref.path }),
    }),
  };

  await setBlockedUser({
    admin: {
      firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'time' } }),
    },
    auth: { uid: 'user-1' },
    data: { blockedUid: 'target-1', blocked: false },
  });

  assert(
    writes.some((entry) => entry.type === 'delete' && entry.path === 'users/user-1/blockedUsers/target-1')
  );
  const stateUpdate = writes.find((entry) => entry.path === 'users/user-1/serverState/moderation');
  assert(stateUpdate?.value?.blockedUserCount === 1);
});
