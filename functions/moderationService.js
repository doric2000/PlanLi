const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { buildModerationPreview, preserveReportedPreview } = require('./moderationPreview');
const { setMediaAvailability } = require('./mediaModeration');
const { collectCanonicalMediaAssets, FINAL_PATH_PATTERN } = require('./mediaProcessor');
const { REPORT_CATEGORIES } = require('./moderationPolicy');
const {
  buildNotificationTarget,
  detachBlockedActorLikeContributions,
  fanoutAdminNotification,
  moderationNavigation,
  moderationNotificationId,
  navigationForTarget,
  notificationRecipientEligible,
  purgeNotificationsForActorForRecipient,
  stageNotificationActivity,
  systemNotificationId,
} = require('./notificationService');

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
const BLOCK_LIMIT = 250;
const BLOCK_MUTATION_RATE_LIMIT = { max: 60, windowMs: 24 * 60 * 60 * 1000 };
const ADMIN_NOTIFICATION_PROJECTION_SCHEMA_VERSION = 1;

function fail(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function cleanId(value, field) {
  const result = typeof value === 'string' ? value : '';
  if (!result || result !== result.trim() || result.length > 180 ||
      result === '.' || result === '..' || /[/\u0000-\u001F\u007F-\u009F]/u.test(result)) {
    fail('invalid-argument', `${field} is invalid.`, 'invalid_target');
  }
  return result;
}

function normalizeReportSubject(input, targetType) {
  if (!input) return null;
  if (input?.kind !== 'attached_place' || !POST_TYPES.has(targetType)) {
    fail('invalid-argument', 'Invalid report subject.', 'invalid_target');
  }
  const field = String(input.field || 'place').trim().toLowerCase();
  if (field !== 'place') fail('invalid-argument', 'Invalid report subject.', 'invalid_target');
  const dayId = input.dayId ? cleanId(input.dayId, 'target.subject.dayId') : null;
  const stopId = input.stopId ? cleanId(input.stopId, 'target.subject.stopId') : null;
  if (targetType === 'route' && (!dayId || !stopId)) {
    fail('invalid-argument', 'A route place report requires a day and stop.', 'invalid_target');
  }
  if (targetType !== 'route' && (dayId || stopId)) {
    fail('invalid-argument', 'The report subject does not match its target.', 'invalid_target');
  }
  return {
    kind: 'attached_place',
    field,
    ...(dayId ? { dayId } : {}),
    ...(stopId ? { stopId } : {}),
  };
}

function normalizeReportTarget(input) {
  const type = String(input?.type || '').trim().toLowerCase();
  if (type === 'comment') {
    const parentType = String(input?.parentType || '').trim().toLowerCase();
    if (!POST_TYPES.has(parentType)) fail('invalid-argument', 'Invalid comment target.', 'invalid_target');
    const parentId = cleanId(input.parentId, 'target.parentId');
    const id = cleanId(input.id, 'target.id');
    const subject = normalizeReportSubject(input?.subject, type);
    return {
      type,
      id,
      parentType,
      parentId,
      path: `${TARGET_COLLECTIONS[parentType]}/${parentId}/comments/${id}`,
      ...(subject ? { subject } : {}),
    };
  }
  if (type === 'destination') {
    const countryId = cleanId(input?.countryId, 'target.countryId');
    const cityId = cleanId(input?.cityId || input?.id, 'target.cityId');
    return {
      type,
      id: cityId,
      countryId,
      cityId,
      path: `countries/${countryId}/destinations/${cityId}`,
    };
  }
  if (!TARGET_COLLECTIONS[type]) fail('invalid-argument', 'Unsupported report target.', 'invalid_target');
  const id = cleanId(input?.id, 'target.id');
  const subject = normalizeReportSubject(input?.subject, type);
  return {
    type,
    id,
    path: `${TARGET_COLLECTIONS[type]}/${id}`,
    ...(subject ? { subject } : {}),
  };
}

function caseIdForPath(path) {
  return crypto.createHash('sha256').update(path).digest('base64url');
}

function caseIdForTarget(target) {
  const subject = target?.subject?.kind === 'attached_place'
    ? `#attached_place:${target.subject.dayId || 'root'}:${target.subject.stopId || target.subject.field}`
    : '';
  return caseIdForPath(`${target.path}${subject}`);
}

function caseStatusForReport(previousStatus, held) {
  if (previousStatus === 'resolving') return 'resolving';
  if (held) return 'auto_held';
  return ['open', 'auto_held'].includes(previousStatus) ? previousStatus : 'open';
}

function moderationDecisionRevision(value = {}) {
  const revision = Number(value.decisionRevision ?? value.revision ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function moderationReportRevision(value = {}) {
  const revision = Number(value.reportRevision ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function caseRevisionsForReport(previous = {}) {
  const decisionRevision = moderationDecisionRevision(previous)
    + (previous.status === 'resolving' ? 0 : 1);
  return {
    revision: decisionRevision,
    decisionRevision,
    reportRevision: moderationReportRevision(previous) + 1,
  };
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
  if (target.type === 'destination') return null;
  return target.type === 'profile' ? target.id : data?.ownerId || data?.authorId || null;
}

function buildAdminNotificationProjection({
  previous,
  newReport,
  urgentEscalated,
  reopening,
  priority,
  reportCount,
  target,
  occurredAt,
}) {
  if (!newReport && !urgentEscalated && !reopening) return null;
  const previousVersion = Number(previous?.version || 0);
  const version = Number.isSafeInteger(previousVersion) && previousVersion >= 0
    ? previousVersion + 1
    : 1;
  return {
    schemaVersion: ADMIN_NOTIFICATION_PROJECTION_SCHEMA_VERSION,
    version,
    subtype: urgentEscalated ? 'urgent_escalation' : 'report_received',
    priority: priority === 'urgent' ? 'urgent' : 'normal',
    count: Math.max(1, Math.trunc(Number(reportCount) || 1)),
    target: buildNotificationTarget({ target, data: { title: target?.title } }),
    occurredAt,
  };
}

function validAdminNotificationProjection(value) {
  return value?.schemaVersion === ADMIN_NOTIFICATION_PROJECTION_SCHEMA_VERSION
    && Number.isSafeInteger(value?.version)
    && value.version >= 1
    && value.version <= 1_000_000_000
    && ['report_received', 'urgent_escalation'].includes(value?.subtype)
    && ['normal', 'urgent'].includes(value?.priority)
    && Number.isSafeInteger(value?.count)
    && value.count >= 1
    && value.target
    && typeof value.target === 'object';
}

function buildHeldMediaProjection({ previous, data, occurredAt }) {
  const assets = collectCanonicalMediaAssets(data).slice(0, 40).flatMap((asset) => {
    const assetId = typeof asset?.assetId === 'string' ? asset.assetId.trim().toLowerCase() : '';
    if (!assetId) return [];
    const sanitized = { assetId };
    for (const variant of ['large', 'feed', 'thumb']) {
      const path = typeof asset?.[variant]?.path === 'string' ? asset[variant].path.trim() : '';
      const match = path.match(FINAL_PATH_PATTERN);
      if (match && match[2].toLowerCase() === assetId && match[3].toLowerCase() === variant) {
        sanitized[variant] = { path };
      }
    }
    return Object.keys(sanitized).length > 1 ? [sanitized] : [];
  });
  const previousVersion = Number(previous?.version || 0);
  return {
    schemaVersion: 1,
    version: Number.isSafeInteger(previousVersion) && previousVersion >= 0
      ? previousVersion + 1
      : 1,
    available: false,
    assets,
    occurredAt,
  };
}

function validHeldMediaProjection(value) {
  return value?.schemaVersion === 1
    && Number.isSafeInteger(value?.version)
    && value.version >= 1
    && value.version <= 1_000_000_000
    && value.available === false
    && Array.isArray(value.assets)
    && value.assets.length <= 40;
}

async function handleModerationCaseNotificationWrite({
  admin,
  event,
  mediaBucket,
  fanoutAdminNotificationImpl = fanoutAdminNotification,
  setMediaAvailabilityImpl = setMediaAvailability,
  resolveCurrentModerationStateImpl = async ({ caseId, targetPath }) => {
    const [caseSnapshot, targetSnapshot] = await Promise.all([
      admin.firestore().doc(`system/moderation/cases/${caseId}`).get(),
      admin.firestore().doc(targetPath).get(),
    ]);
    return {
      caseData: caseSnapshot.exists ? caseSnapshot.data() || {} : null,
      targetData: targetSnapshot.exists ? targetSnapshot.data() || {} : null,
    };
  },
}) {
  const before = event?.data?.before?.exists ? event.data.before.data() || {} : {};
  const after = event?.data?.after?.exists ? event.data.after.data() || {} : null;
  const projection = after?.adminNotification;
  const beforeVersion = Number(before?.adminNotification?.version || 0);
  const mediaProjection = after?.mediaModeration;
  const beforeMediaVersion = Number(before?.mediaModeration?.version || 0);
  const hasNotificationActivity = validAdminNotificationProjection(projection)
    && projection.version > beforeVersion;
  const hasMediaActivity = validHeldMediaProjection(mediaProjection)
    && mediaProjection.version > beforeMediaVersion;
  if (!hasNotificationActivity && !hasMediaActivity) {
    return { status: 'ignored', reason: 'no_new_admin_notification' };
  }
  const caseId = cleanId(event?.params?.caseId, 'caseId');
  const mediaTask = hasMediaActivity
    ? (async () => {
      const targetPath = after?.target?.path;
      if (typeof targetPath !== 'string' || !targetPath) return null;
      const current = await resolveCurrentModerationStateImpl({ caseId, targetPath });
      if (
        current?.caseData?.mediaModeration?.version !== mediaProjection.version
        || current?.targetData?.status !== 'moderation_hold'
      ) return null;
      return setMediaAvailabilityImpl({
        admin,
        data: { media: mediaProjection.assets },
        mediaBucket,
        available: false,
        reason: 'community_reports',
      });
    })()
    : Promise.resolve(null);
  if (!hasNotificationActivity) {
    await mediaTask;
    return { status: 'media_updated', mediaVersion: mediaProjection.version };
  }
  const fanoutTask = fanoutAdminNotificationImpl({
    admin,
    notificationId: moderationNotificationId(caseId),
    activityVersion: projection.version,
    notification: {
      channel: 'admin',
      type: 'moderation',
      subtype: projection.subtype,
      priority: projection.priority,
      count: projection.count,
      target: projection.target,
      navigation: moderationNavigation(caseId),
      createdAt: projection.occurredAt || after.updatedAt,
    },
  });
  const [, deliveries] = await Promise.all([mediaTask, fanoutTask]);
  return {
    status: 'fanout',
    version: projection.version,
    deliveries: deliveries.length,
    ...(hasMediaActivity ? { mediaVersion: mediaProjection.version } : {}),
  };
}

async function submitReport({ admin, auth, data, mediaBucket, nowMs = Date.now() }) {
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
  const caseId = caseIdForTarget(target);
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
    if (!['profile', 'destination'].includes(target.type) && targetData.status !== 'active') {
      fail('failed-precondition', 'The reported item is unavailable.', 'target_inactive');
    }
    if (target.type === 'destination' && targetData.status === 'inactive') {
      fail('failed-precondition', 'The reported destination is unavailable.', 'target_inactive');
    }
    let subjectData = null;
    if (target.type === 'route' && target.subject?.kind === 'attached_place') {
      const revisionId = cleanId(targetData.activeRevisionId, 'target.activeRevisionId');
      const subjectSnapshot = await transaction.get(db.doc(
        `routes/${target.id}/revisions/${revisionId}/days/${target.subject.dayId}/stops/${target.subject.stopId}`
      ));
      if (!subjectSnapshot.exists) {
        fail('not-found', 'The reported place is no longer attached to the route.', 'target_missing');
      }
      subjectData = subjectSnapshot.data() || {};
    }
    const ownerId = targetOwner(target, targetData);
    if (!ownerId && target.type !== 'destination') {
      fail('failed-precondition', 'The reported item has no owner.', 'target_owner_missing');
    }
    if (ownerId === auth.uid) fail('failed-precondition', 'You cannot report your own content.', 'self_report');

    const ownerProfileSnapshot = target.type === 'profile'
      ? targetSnapshot
      : ownerId
        ? await transaction.get(db.doc(`publicProfiles/${ownerId}`))
        : null;
    const targetPreview = buildModerationPreview({
      target,
      data: subjectData ? { ...targetData, place: subjectData.place, attachedPlace: subjectData } : targetData,
      parentData: parentSnapshot?.exists ? parentSnapshot.data() : null,
      ownerProfile: ownerProfileSnapshot?.exists ? ownerProfileSnapshot.data() : null,
    });

    const previous = caseSnapshot.exists ? caseSnapshot.data() || {} : {};
    const previousStatus = previous.status || 'open';
    const reopening = !['open', 'auto_held', 'resolving'].includes(previousStatus);
    const urgentCategory = ['child_safety', 'violence_dangerous_illegal'].includes(category);
    const notificationPriority = urgentCategory ? 'urgent' : (previous.priority || 'normal');
    const urgentEscalated = urgentCategory && previous.priority !== 'urgent';
    const newReport = !existingReport.exists;
    const reportCount = Number(previous.reportCount || 0) + (newReport ? 1 : 0);
    const recentReporters = Object.fromEntries(Object.entries(previous.recentReporters || {})
      .filter(([, timestamp]) => nowMs - Number(timestamp) < REPORT_WINDOW_MS));
    const alreadyCounted = Boolean(recentReporters[auth.uid]);
    if (!alreadyCounted) recentReporters[auth.uid] = nowMs;
    const uniqueCount24h = Object.keys(recentReporters).length;
    held = POST_TYPES.has(target.type) && uniqueCount24h >= AUTO_HOLD_THRESHOLD
      && targetData.status === 'active';
    const notificationTarget = buildNotificationTarget({
      target,
      data: targetData,
      parentData: parentSnapshot?.exists ? parentSnapshot.data() : null,
    });
    const adminNotification = buildAdminNotificationProjection({
      previous: previous.adminNotification,
      newReport,
      urgentEscalated,
      reopening,
      priority: notificationPriority,
      reportCount,
      target: notificationTarget,
      occurredAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const mediaModeration = held
      ? buildHeldMediaProjection({
        previous: previous.mediaModeration,
        data: targetData,
        occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      : null;
    let heldNotificationRef = null;
    let heldNotificationSnapshot = null;
    let ownerUserSnapshot = null;
    if (held) {
      heldNotificationRef = db.doc(
        `users/${ownerId}/notifications/${systemNotificationId('content_held', target.path)}`
      );
      [heldNotificationSnapshot, ownerUserSnapshot] = await Promise.all([
        transaction.get(heldNotificationRef),
        transaction.get(db.doc(`users/${ownerId}`)),
      ]);
    }

    transaction.set(caseRef, {
      caseId,
      target,
      ...(ownerId ? { targetOwnerId: ownerId } : {}),
      targetPreview: preserveReportedPreview(previous.targetPreview, targetPreview),
      status: caseStatusForReport(previousStatus, held),
      priority: notificationPriority,
      source: previous.source || 'report',
      ...caseRevisionsForReport(previous),
      assignmentUid: previous.assignmentUid || '',
      reportCount,
      uniqueCount24h,
      recentReporters,
      categoryCounts: {
        ...(previous.categoryCounts || {}),
        [category]: Number(previous.categoryCounts?.[category] || 0) + (existingReport.exists ? 0 : 1),
      },
      firstReportedAt: previous.firstReportedAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
      dueAtMs: nowMs + (['child_safety', 'violence_dangerous_illegal'].includes(category) ? 4 : 24) * 60 * 60 * 1000,
      ...(adminNotification ? { adminNotification } : {}),
      ...(mediaModeration ? { mediaModeration } : {}),
      ...(reopening ? {
        resolvedAt: admin.firestore.FieldValue.delete(),
        resolvedBy: admin.firestore.FieldValue.delete(),
        resolutionReason: admin.firestore.FieldValue.delete(),
        resolution: admin.firestore.FieldValue.delete(),
      } : {}),
    }, { merge: true });
    transaction.set(reportRef, {
      reporterId: auth.uid,
      category,
      details,
      ...(ownerId ? { targetOwnerId: ownerId } : {}),
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
      if (notificationRecipientEligible(ownerUserSnapshot)) {
        stageNotificationActivity({
          transaction,
          admin,
          db,
          uid: ownerId,
          notificationRef: heldNotificationRef,
          existingSnapshot: heldNotificationSnapshot,
          notification: {
            channel: 'personal',
            type: 'system',
            subtype: 'content_held',
            priority: 'normal',
            count: 1,
            target: notificationTarget,
            navigation: navigationForTarget(target),
          },
        });
      }
    }
  });
  return { submitted: true, caseId, held };
}

async function setBlockedUser({
  admin,
  auth,
  data,
  purgeNotificationsForActorForRecipientImpl = purgeNotificationsForActorForRecipient,
  detachBlockedActorLikeContributionsImpl = detachBlockedActorLikeContributions,
}) {
  if (!auth?.uid) fail('unauthenticated', 'Sign in is required.', 'sign_in_required');
  const blockedUid = cleanId(data?.blockedUid, 'blockedUid');
  if (blockedUid === auth.uid) fail('failed-precondition', 'You cannot block yourself.', 'self_block');
  if (typeof data?.blocked !== 'boolean') fail('invalid-argument', 'blocked must be boolean.', 'invalid_block_state');
  const db = admin.firestore();
  const ref = db.doc(`users/${auth.uid}/blockedUsers/${blockedUid}`);
  const stateRef = db.doc(`users/${auth.uid}/serverState/moderation`);
  const targetRef = db.doc(`publicProfiles/${blockedUid}`);
  const nowMs = Date.now();
  await db.runTransaction(async (transaction) => {
    const [existing, state, target] = await Promise.all([
      transaction.get(ref),
      transaction.get(stateRef),
      data.blocked ? transaction.get(targetRef) : Promise.resolve(null),
    ]);
    if (data.blocked && (!target?.exists || target.data()?.status !== 'active')) {
      fail('not-found', 'The account to block is unavailable.', 'block_target_missing');
    }
    const previous = state.exists ? state.data() || {} : {};
    const inWindow = nowMs - Number(previous.blockWindowStartedAtMs || 0)
      < BLOCK_MUTATION_RATE_LIMIT.windowMs;
    const mutations = inWindow ? Number(previous.blockMutationCount || 0) : 0;
    if (mutations >= BLOCK_MUTATION_RATE_LIMIT.max) {
      fail('resource-exhausted', 'Too many block-list changes.', 'block_rate_limited');
    }
    let currentCount = Math.max(0, Number(previous.blockedUserCount || 0));
    if (!state.exists) {
      const existingBlocks = await transaction.get(ref.parent.limit(BLOCK_LIMIT + 1));
      currentCount = existingBlocks.size;
    }
    const adding = data.blocked && !existing.exists;
    const removing = !data.blocked && existing.exists;
    if (adding && currentCount >= BLOCK_LIMIT) {
      fail('resource-exhausted', 'The blocked-user limit was reached.', 'block_limit_reached');
    }
    if (adding) {
      transaction.set(ref, { blockedUid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    } else if (removing) {
      transaction.delete(ref);
    }
    transaction.set(stateRef, {
      blockedUserCount: adding ? currentCount + 1 : removing ? Math.max(0, currentCount - 1) : currentCount,
      blockMutationCount: mutations + 1,
      blockWindowStartedAtMs: inWindow ? previous.blockWindowStartedAtMs : nowMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  if (data.blocked) {
    await Promise.all([
      purgeNotificationsForActorForRecipientImpl({
        admin,
        uid: auth.uid,
        actorId: blockedUid,
      }),
      detachBlockedActorLikeContributionsImpl({
        admin,
        uid: auth.uid,
        actorId: blockedUid,
      }),
    ]);
  }
  return { blocked: data.blocked, blockedUid };
}

async function handleBlockedUserNotificationWrite({ admin, event }) {
  const after = event?.data?.after;
  if (!after?.exists) return { status: 'ignored', reason: 'not_blocked' };
  const uid = cleanId(event?.params?.uid, 'uid');
  const blockedUid = cleanId(event?.params?.blockedUid, 'blockedUid');
  const [purged, detached] = await Promise.all([
    purgeNotificationsForActorForRecipient({ admin, uid, actorId: blockedUid }),
    detachBlockedActorLikeContributions({ admin, uid, actorId: blockedUid }),
  ]);
  return { status: 'complete', purged, detached };
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
  ADMIN_NOTIFICATION_PROJECTION_SCHEMA_VERSION,
  AUTO_HOLD_THRESHOLD,
  BLOCK_LIMIT,
  DETAILS_REQUIRED,
  REPORT_CATEGORIES,
  REPORT_WINDOW_MS,
  caseIdForPath,
  caseIdForTarget,
  caseRevisionsForReport,
  caseStatusForReport,
  moderationDecisionRevision,
  moderationReportRevision,
  buildAdminNotificationProjection,
  buildHeldMediaProjection,
  evaluateTextSafety,
  handleModerationCaseNotificationWrite,
  handleBlockedUserNotificationWrite,
  normalizeReportInput,
  normalizeReportSubject,
  normalizeReportTarget,
  setBlockedUser,
  submitReport,
};
