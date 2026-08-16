const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { buildModerationPreview, preserveReportedPreview } = require('./moderationPreview');

const REPORT_CATEGORIES = Object.freeze([
  'inaccurate_or_unsafe_travel_info',
  'spam_scam_commercial',
  'harassment_hate_threat',
  'nudity_sexual',
  'child_safety',
  'violence_dangerous_illegal',
  'privacy_personal_data',
  'copyright_image_rights',
  'impersonation',
  'other',
]);
const DETAILS_REQUIRED = new Set([
  'inaccurate_or_unsafe_travel_info',
  'copyright_image_rights',
  'other',
]);
const POST_TYPES = new Set(['recommendation', 'route', 'trip']);
const TARGET_COLLECTIONS = Object.freeze({
  recommendation: 'recommendations',
  route: 'routes',
  trip: 'trips',
  profile: 'publicProfiles',
});
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const AUTO_HOLD_THRESHOLD = 3;
const REPORT_RATE_LIMIT = { max: 20, windowMs: 24 * 60 * 60 * 1000 };

function fail(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function cleanId(value, field) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 180 || result.includes('/')) {
    fail('invalid-argument', `${field} is invalid.`, 'invalid_target');
  }
  return result;
}

function normalizeReportTarget(input) {
  const type = String(input?.type || '').trim().toLowerCase();
  if (type === 'comment') {
    const parentType = String(input?.parentType || '').trim().toLowerCase();
    if (!POST_TYPES.has(parentType)) fail('invalid-argument', 'Invalid comment target.', 'invalid_target');
    const parentId = cleanId(input.parentId, 'target.parentId');
    const id = cleanId(input.id, 'target.id');
    return {
      type,
      id,
      parentType,
      parentId,
      path: `${TARGET_COLLECTIONS[parentType]}/${parentId}/comments/${id}`,
    };
  }
  if (!TARGET_COLLECTIONS[type]) fail('invalid-argument', 'Unsupported report target.', 'invalid_target');
  const id = cleanId(input?.id, 'target.id');
  return { type, id, path: `${TARGET_COLLECTIONS[type]}/${id}` };
}

function caseIdForPath(path) {
  return crypto.createHash('sha256').update(path).digest('base64url');
}

function caseStatusForReport(previousStatus, held) {
  if (held) return 'auto_held';
  return ['open', 'auto_held'].includes(previousStatus) ? previousStatus : 'open';
}

function normalizeReportInput(data) {
  const target = normalizeReportTarget(data?.target);
  const category = String(data?.category || '').trim();
  if (!REPORT_CATEGORIES.includes(category)) {
    fail('invalid-argument', 'Invalid report category.', 'invalid_category');
  }
  const details = typeof data?.details === 'string' ? data.details.trim() : '';
  if (details.length > 500) fail('invalid-argument', 'Report details are too long.', 'details_too_long');
  if (DETAILS_REQUIRED.has(category) && details.length < 5) {
    fail('invalid-argument', 'Report details are required.', 'details_required');
  }
  return { target, category, details };
}

function targetOwner(target, data) {
  return target.type === 'profile' ? target.id : data?.ownerId || data?.authorId || null;
}

async function submitReport({ admin, auth, data, nowMs = Date.now() }) {
  if (!auth?.uid) fail('unauthenticated', 'Sign in is required.', 'sign_in_required');
  const { target, category, details } = normalizeReportInput(data);
  const db = admin.firestore();
  const rateRef = db.doc(`users/${auth.uid}/serverState/rateLimits_report`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateRef);
    const previous = snapshot.exists ? snapshot.data() || {} : {};
    const inWindow = nowMs - Number(previous.windowStartedAtMs || 0) < REPORT_RATE_LIMIT.windowMs;
    const count = inWindow ? Number(previous.count || 0) : 0;
    if (count >= REPORT_RATE_LIMIT.max) fail('resource-exhausted', 'Too many reports.', 'report_rate_limited');
    transaction.set(rateRef, {
      count: count + 1,
      windowStartedAtMs: inWindow ? previous.windowStartedAtMs : nowMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  const targetRef = db.doc(target.path);
  const caseId = caseIdForPath(target.path);
  const caseRef = db.doc(`system/moderation/cases/${caseId}`);
  const reportRef = caseRef.collection('reports').doc(auth.uid);
  let held = false;

  await db.runTransaction(async (transaction) => {
    const parentRef = target.type === 'comment'
      ? db.doc(`${TARGET_COLLECTIONS[target.parentType]}/${target.parentId}`)
      : null;
    const [targetSnapshot, caseSnapshot, existingReport, parentSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(caseRef),
      transaction.get(reportRef),
      parentRef ? transaction.get(parentRef) : Promise.resolve(null),
    ]);
    if (!targetSnapshot.exists) fail('not-found', 'The reported item no longer exists.', 'target_missing');
    const targetData = targetSnapshot.data() || {};
    if (target.type !== 'profile' && targetData.status !== 'active') {
      fail('failed-precondition', 'The reported item is unavailable.', 'target_inactive');
    }
    const ownerId = targetOwner(target, targetData);
    if (!ownerId) fail('failed-precondition', 'The reported item has no owner.', 'target_owner_missing');
    if (ownerId === auth.uid) fail('failed-precondition', 'You cannot report your own content.', 'self_report');

    const ownerProfileSnapshot = target.type === 'profile'
      ? targetSnapshot
      : await transaction.get(db.doc(`publicProfiles/${ownerId}`));
    const targetPreview = buildModerationPreview({
      target,
      data: targetData,
      parentData: parentSnapshot?.exists ? parentSnapshot.data() : null,
      ownerProfile: ownerProfileSnapshot?.exists ? ownerProfileSnapshot.data() : null,
    });

    const previous = caseSnapshot.exists ? caseSnapshot.data() || {} : {};
    const previousStatus = previous.status || 'open';
    const reopening = !['open', 'auto_held'].includes(previousStatus);
    const recentReporters = Object.fromEntries(Object.entries(previous.recentReporters || {})
      .filter(([, timestamp]) => nowMs - Number(timestamp) < REPORT_WINDOW_MS));
    const alreadyCounted = Boolean(recentReporters[auth.uid]);
    if (!alreadyCounted) recentReporters[auth.uid] = nowMs;
    const uniqueCount24h = Object.keys(recentReporters).length;
    held = POST_TYPES.has(target.type) && uniqueCount24h >= AUTO_HOLD_THRESHOLD
      && targetData.status === 'active';

    transaction.set(caseRef, {
      caseId,
      target,
      targetOwnerId: ownerId,
      targetPreview: preserveReportedPreview(previous.targetPreview, targetPreview),
      status: caseStatusForReport(previousStatus, held),
      priority: ['child_safety', 'violence_dangerous_illegal'].includes(category) ? 'urgent' : (previous.priority || 'normal'),
      reportCount: Number(previous.reportCount || 0) + (existingReport.exists ? 0 : 1),
      uniqueCount24h,
      recentReporters,
      categoryCounts: {
        ...(previous.categoryCounts || {}),
        [category]: Number(previous.categoryCounts?.[category] || 0) + (existingReport.exists ? 0 : 1),
      },
      firstReportedAt: previous.firstReportedAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      dueAtMs: nowMs + (['child_safety', 'violence_dangerous_illegal'].includes(category) ? 4 : 24) * 60 * 60 * 1000,
      ...(reopening ? {
        resolvedAt: admin.firestore.FieldValue.delete(),
        resolvedBy: admin.firestore.FieldValue.delete(),
        resolutionReason: admin.firestore.FieldValue.delete(),
      } : {}),
    }, { merge: true });
    transaction.set(reportRef, {
      reporterId: auth.uid,
      category,
      details,
      targetOwnerId: ownerId,
      createdAt: existingReport.exists
        ? existingReport.data().createdAt
        : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (held) {
      transaction.update(targetRef, {
        status: 'moderation_hold',
        'moderation.holdReason': 'community_reports',
        'moderation.heldAt': admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
  const admins = await db.collection('system/moderation/admins').where('active', '==', true).limit(50).get();
  if (!admins.empty) {
    const batch = db.batch();
    admins.docs.forEach((entry) => batch.set(
      db.doc(`users/${entry.id}/notifications/moderation_${caseId}`),
      {
        type: 'moderation',
        caseId,
        priority: ['child_safety', 'violence_dangerous_illegal'].includes(category) ? 'urgent' : 'normal',
        target,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    ));
    await batch.commit();
  }
  return { submitted: true, caseId, held };
}

async function setBlockedUser({ admin, auth, data }) {
  if (!auth?.uid) fail('unauthenticated', 'Sign in is required.', 'sign_in_required');
  const blockedUid = cleanId(data?.blockedUid, 'blockedUid');
  if (blockedUid === auth.uid) fail('failed-precondition', 'You cannot block yourself.', 'self_block');
  if (typeof data?.blocked !== 'boolean') fail('invalid-argument', 'blocked must be boolean.', 'invalid_block_state');
  const ref = admin.firestore().doc(`users/${auth.uid}/blockedUsers/${blockedUid}`);
  if (data.blocked) {
    await ref.set({ blockedUid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } else {
    await ref.delete();
  }
  return { blocked: data.blocked, blockedUid };
}

const SEVERE_PATTERNS = [
  /(?:kill|murder|rape|child\s*(?:porn|sex)|terrorist)/i,
  /(?:להרוג|רצח|אונס|פורנו\s*ילדים|פיגוע)/,
];
const ABUSE_PATTERNS = [
  /(?:nudes?|porn|buy\s+followers|crypto\s+guaranteed|whatsapp\s+me)/i,
  /(?:עירום|פורנו|קנו\s*עוקבים|רווח\s*מובטח|שלחו\s*לי\s*וואטסאפ)/,
];

function evaluateTextSafety(fields) {
  const text = (Array.isArray(fields) ? fields : [fields])
    .filter((value) => typeof value === 'string')
    .join(' ')
    .normalize('NFKC');
  if (SEVERE_PATTERNS.some((pattern) => pattern.test(text))) return { safe: false, severity: 'severe', reason: 'unsafe_text' };
  if (ABUSE_PATTERNS.some((pattern) => pattern.test(text))) return { safe: false, severity: 'suspicious', reason: 'suspicious_text' };
  return { safe: true, severity: null, reason: null };
}

module.exports = {
  AUTO_HOLD_THRESHOLD,
  DETAILS_REQUIRED,
  REPORT_CATEGORIES,
  REPORT_WINDOW_MS,
  caseIdForPath,
  caseStatusForReport,
  evaluateTextSafety,
  normalizeReportInput,
  normalizeReportTarget,
  setBlockedUser,
  submitReport,
};
