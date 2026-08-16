const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REPORT_CATEGORIES,
  caseIdForPath,
  caseStatusForReport,
  evaluateTextSafety,
  normalizeReportInput,
  normalizeReportTarget,
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
