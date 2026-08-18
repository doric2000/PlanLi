const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REPORT_CATEGORIES,
  caseIdForPath,
  caseStatusForReport,
  evaluateTextSafety,
  normalizeReportInput,
  normalizeReportTarget,
  setBlockedUser,
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
  });
  assert(fixture.writes.some((entry) => entry.path === 'users/user-1/blockedUsers/target-1'));
  assert(fixture.writes.some((entry) => entry.value?.blockedUserCount === 250));
});
