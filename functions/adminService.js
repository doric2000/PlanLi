const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { geohashForLocation } = require('geofire-common');
const { caseIdForTarget, normalizeReportTarget } = require('./moderationService');
const { buildModerationPreview, canonicalTargetPath, hydrateModerationPreviews } = require('./moderationPreview');
const {
  ACCOUNT_ACTIONS,
  BULK_OPERATIONS,
  CONTENT_ACTIONS,
  SUSPENSION_HOURS,
  policyReason,
  publicModerationPolicy,
} = require('./moderationPolicy');
const { deleteComment } = require('./socialService');
const { isPublicProfileEligible, sanitizePublicProfile } = require('./publicProfiles');
const { activateAdminRegistry, deactivateAdminRegistry } = require('./adminAuthorization');
const { buildSearchIndex, normalizeSearchText } = require('./discoverySearch');
const { readResolvedPlaceToken } = require('./placesGatewayService');
const { setMediaAvailability } = require('./mediaModeration');
const {
  deleteAccountInternal,
  deleteContentInternal,
} = require('./deletionService');
const {
  buildNotificationTarget,
  completeOwnerNotificationOutbox,
  detachGroupedLikeContribution,
  navigationForTarget,
  notificationRecipientEligible,
  ownerNotificationOutboxId,
  prepareOwnerNotificationOutbox,
  purgeAdminNotificationsForUser,
  purgeNotificationsForActor,
  purgeNotificationsForTarget,
  stageNotificationActivity,
  systemNotificationId,
} = require('./notificationService');

const PAGE_SIZE = 30;
const MAX_BULK_CASES = 25;
const MAX_CASE_EVENTS = 100;
const RECENT_AUTH_SECONDS = 10 * 60;
const MODERATION_TRANSITION_TTL_MS = 10 * 60 * 1000;
// Only actions that can change account authority, account trust level, or
// suspend/remove content are marked sensitive. CRUD-like content-enrichment and
// destination maintenance actions stay non-sensitive to avoid unnecessary
// re-auth flow in normal moderation work.
const SENSITIVE_ADMIN_ACTIONS = Object.freeze({
  moderateContent: {
    recentSignIn: true,
    reason: 'content moderation and deletion (reports, holds, restores, deletions).',
  },
  resolveModerationCase: {
    recentSignIn: true,
    reason: 'resolving moderation cases can change content and account availability.',
  },
  bulkUpdateModerationCases: {
    recentSignIn: true,
    reason: 'bulk dismissal resolves multiple moderation cases.',
  },
  setUserSuspension: {
    recentSignIn: true,
    reason: 'suspending/unsuspending a user affects account availability.',
  },
  setUserEmailVerified: {
    recentSignIn: true,
    reason: 'changing a user’s email verification state alters account trust level.',
  },
  setUserAdmin: {
    recentSignIn: true,
    reason: 'granting/removing admin rights changes system privileges.',
  },
  deleteUserAsAdmin: {
    recentSignIn: true,
    reason: 'full account deletion removes data and media and is irreversible.',
  },
  deactivateDestination: {
    recentSignIn: true,
    reason: 'deactivating a city affects public catalog and linked public content.',
  },
  setDestinationHebrewName: {
    recentSignIn: true,
    reason: 'renaming a destination updates public catalog and linked public content.',
  },
  updateAdminAttachedPlace: {
    recentSignIn: true,
    reason: 'correcting an attached place changes published location data.',
  },
});

function isRecentSignInRequired(action) {
  return !!SENSITIVE_ADMIN_ACTIONS[action]?.recentSignIn;
}

function sensitiveAdminActions() {
  return Object.freeze({ ...SENSITIVE_ADMIN_ACTIONS });
}

function fail(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function assertAdmin(auth) {
  if (!auth?.uid || auth.token?.admin !== true) fail('permission-denied', 'Admin access is required.', 'admin_required');
}

function assertRecentAuth(auth) {
  const authTime = Number(auth?.token?.auth_time || 0);
  if (!authTime || Date.now() / 1000 - authTime > RECENT_AUTH_SECONDS) {
    fail('failed-precondition', 'Recent sign-in is required.', 'recent_sign_in_required');
  }
}

function cleanText(value, field, maximum = 500) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > maximum) fail('invalid-argument', `${field} is invalid.`, 'invalid_input');
  return result;
}

function serialize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function publicModerationReport(entry) {
  const report = entry?.data?.() || {};
  return {
    category: report.category || 'other',
    details: report.details || '',
    createdAt: report.createdAt || null,
    updatedAt: report.updatedAt || null,
  };
}

function publicModerationCase(item = {}) {
  return {
    id: item.id || '',
    caseId: item.caseId || item.id || '',
    target: item.target || null,
    targetOwnerId: item.targetOwnerId || null,
    targetPreview: item.targetPreview || null,
    status: item.status || 'open',
    priority: item.priority || 'normal',
    source: item.source || 'report',
    revision: Math.max(0, Number(item.revision || 0)),
    assignment: item.assignment && typeof item.assignment === 'object'
      ? {
          uid: item.assignment.uid || '',
          displayName: item.assignment.displayName || '',
          assignedAt: item.assignment.assignedAt || null,
        }
      : null,
    assignmentUid: item.assignmentUid || item.assignment?.uid || '',
    reportCount: Number(item.reportCount || 0),
    uniqueCount24h: Number(item.uniqueCount24h || 0),
    categoryCounts: item.categoryCounts || {},
    firstReportedAt: item.firstReportedAt || null,
    updatedAt: item.updatedAt || null,
    lastActivityAt: item.lastActivityAt || item.updatedAt || null,
    dueAtMs: Number(item.dueAtMs || 0) || null,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: item.resolvedBy || null,
    resolutionReason: item.resolutionReason || '',
    resolution: item.resolution && typeof item.resolution === 'object' ? item.resolution : null,
  };
}

function cleanOptionalText(value, maximum = 500) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length > maximum) fail('invalid-argument', 'Input is too long.', 'invalid_input');
  return result;
}

function cleanEnum(value, allowed, field) {
  const result = String(value || '').trim();
  if (!allowed.includes(result)) fail('invalid-argument', `${field} is invalid.`, 'invalid_input');
  return result;
}

function expectedRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    fail('invalid-argument', 'expectedRevision is invalid.', 'invalid_revision');
  }
  return revision;
}

function caseEventRef(db, caseId) {
  const id = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  return db.doc(`system/moderation/cases/${caseId}/events/${id}`);
}

function actorProjection(auth) {
  return {
    uid: auth.uid,
    displayName: typeof auth.token?.name === 'string'
      ? auth.token.name.trim().slice(0, 80)
      : 'מנהל מערכת',
  };
}

async function assertActiveAdminRegistry({ admin, auth }) {
  const ref = admin.firestore().doc(`system/moderation/admins/${auth.uid}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.active !== true) {
    fail('permission-denied', 'Admin access is required.', 'admin_required');
  }
}

async function audit({ admin, auth, action, target = null, reason, metadata = {} }) {
  const id = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  await admin.firestore().doc(`system/moderation/audit/${id}`).create({
    actorUid: auth.uid,
    actorName: typeof auth.token?.name === 'string' ? auth.token.name.trim().slice(0, 80) : '',
    action,
    target,
    reason,
    metadata,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return id;
}

async function prepareAdmin(admin, auth, { recent = false } = {}) {
  assertAdmin(auth);
  if (recent) assertRecentAuth(auth);
  await assertActiveAdminRegistry({ admin, auth });
}

async function prepareAdminAction(admin, auth, action) {
  await prepareAdmin(admin, auth, { recent: isRecentSignInRequired(action) });
}

async function getModerationDashboard({ admin, auth }) {
  await prepareAdminAction(admin, auth, 'getModerationDashboard');
  const db = admin.firestore();
  const cases = db.collection('system/moderation/cases');
  const [open, urgent, mine, unassigned, overdue, heldRecommendations, heldRoutes, heldTrips, pendingDestinations, failedJobs] = await Promise.all([
    cases.where('status', 'in', ['open', 'auto_held']).count().get(),
    cases.where('priority', '==', 'urgent').where('status', 'in', ['open', 'auto_held']).count().get(),
    cases.where('assignmentUid', '==', auth.uid).where('status', 'in', ['open', 'auto_held']).count().get(),
    cases.where('assignmentUid', '==', '').where('status', 'in', ['open', 'auto_held']).count().get(),
    cases.where('status', 'in', ['open', 'auto_held']).where('dueAtMs', '<', Date.now()).count().get(),
    db.collection('recommendations').where('status', '==', 'moderation_hold').count().get(),
    db.collection('routes').where('status', '==', 'moderation_hold').count().get(),
    db.collection('trips').where('status', '==', 'moderation_hold').count().get(),
    db.collection('system/moderation/destinationReviews')
      .where('status', 'in', ['blocked', 'open', 'ready'])
      .count()
      .get(),
    db.collection('system/moderation/jobs').where('status', 'in', ['failed', 'retry']).count().get(),
  ]);
  return {
    openCases: open.data().count,
    urgentCases: urgent.data().count,
    myCases: mine.data().count,
    unassignedCases: unassigned.data().count,
    overdueCases: overdue.data().count,
    heldContent: heldRecommendations.data().count + heldRoutes.data().count + heldTrips.data().count,
    pendingDestinations: pendingDestinations.data().count,
    failedJobs: failedJobs.data().count,
  };
}

async function listModerationCases({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listModerationCases');
  const view = String(data?.view || '').trim();
  const requestedStatuses = Array.isArray(data?.statuses)
    ? Array.from(new Set(data.statuses.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, 10)
    : typeof data?.status === 'string' && data.status !== 'all'
      ? [data.status]
      : view === 'held'
        ? ['auto_held', 'resolved_held']
        : view === 'history' || data?.status === 'all'
          ? []
          : ['open', 'auto_held'];
  const sort = ['due_asc', 'reports_desc', 'updated_desc'].includes(data?.sort)
    ? data.sort
    : ['urgent', 'overdue'].includes(view) ? 'due_asc' : 'updated_desc';
  const scanLimit = PAGE_SIZE * 3;
  let query = admin.firestore().collection('system/moderation/cases');
  if (requestedStatuses.length === 1) query = query.where('status', '==', requestedStatuses[0]);
  else if (requestedStatuses.length > 1) query = query.where('status', 'in', requestedStatuses);
  if (view === 'urgent') query = query.where('priority', '==', 'urgent');
  if (view === 'mine' || data?.assignee === 'me') query = query.where('assignmentUid', '==', auth.uid);
  else if (view === 'unassigned' || data?.assignee === 'unassigned') query = query.where('assignmentUid', '==', '');
  else if (typeof data?.assignee === 'string' && data.assignee.trim()) {
    query = query.where('assignmentUid', '==', cleanText(data.assignee, 'assignee', 180));
  }
  if (view === 'overdue') query = query.where('dueAtMs', '<', Date.now());
  query = query.orderBy(
    sort === 'due_asc' ? 'dueAtMs' : sort === 'reports_desc' ? 'reportCount' : 'updatedAt',
    sort === 'due_asc' ? 'asc' : 'desc'
  ).limit(scanLimit);
  if (data?.cursor) {
    const cursor = await admin.firestore().doc(`system/moderation/cases/${cleanText(data.cursor, 'cursor', 180)}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  const hydrated = await hydrateModerationPreviews(admin, snapshot.docs.map((entry) => ({
    id: entry.id,
    ...entry.data(),
  })));
  const targetTypes = new Set((Array.isArray(data?.targetTypes) ? data.targetTypes : [])
    .map((value) => String(value || '').trim()).filter(Boolean));
  const categories = new Set((Array.isArray(data?.categories) ? data.categories : [])
    .map((value) => String(value || '').trim()).filter(Boolean));
  const priorities = new Set((Array.isArray(data?.priorities) ? data.priorities : [])
    .map((value) => String(value || '').trim()).filter(Boolean));
  const textQuery = cleanOptionalText(data?.query, 120).toLocaleLowerCase('he');
  const minimumReports = Math.max(0, Math.min(1000, Math.trunc(Number(data?.minimumReports) || 0)));
  const reportedAfter = data?.reportedAfter ? Date.parse(String(data.reportedAfter)) : NaN;
  const reportedBefore = data?.reportedBefore
    ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(data.reportedBefore))
      ? `${data.reportedBefore}T23:59:59.999Z`
      : String(data.reportedBefore))
    : NaN;
  const filtered = hydrated.filter((item) => {
    if (targetTypes.size && !targetTypes.has(item.target?.type)) return false;
    if (priorities.size && !priorities.has(item.priority || 'normal')) return false;
    if (categories.size && !Object.keys(item.categoryCounts || {}).some((key) => categories.has(key))) return false;
    if (Number(item.reportCount || 0) < minimumReports) return false;
    const reportedAt = typeof item.firstReportedAt?.toMillis === 'function'
      ? item.firstReportedAt.toMillis()
      : Date.parse(String(item.firstReportedAt || ''));
    if (Number.isFinite(reportedAfter) && (!Number.isFinite(reportedAt) || reportedAt < reportedAfter)) return false;
    if (Number.isFinite(reportedBefore) && (!Number.isFinite(reportedAt) || reportedAt > reportedBefore)) return false;
    if (textQuery) {
      const haystack = [item.id, item.target?.id, item.targetPreview?.title, item.targetPreview?.author?.displayName]
        .filter(Boolean).join(' ').toLocaleLowerCase('he');
      if (!haystack.includes(textQuery)) return false;
    }
    return true;
  });
  const items = filtered.slice(0, PAGE_SIZE);
  const bufferedCursor = filtered.length > PAGE_SIZE ? items.at(-1)?.id : null;
  return {
    items: items.map((item) => serialize(publicModerationCase(item))),
    nextCursor: bufferedCursor
      || (snapshot.size === scanLimit ? snapshot.docs.at(-1)?.id || null : null),
  };
}

async function getModerationCase({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getModerationCase');
  const caseId = cleanText(data?.caseId, 'caseId', 180);
  const ref = admin.firestore().doc(`system/moderation/cases/${caseId}`);
  const [snapshot, reports, events, enforcements] = await Promise.all([
    ref.get(),
    ref.collection('reports').orderBy('updatedAt', 'desc').limit(50).get(),
    ref.collection('events').orderBy('createdAt', 'desc').limit(MAX_CASE_EVENTS).get(),
    admin.firestore().collection('system/moderation/enforcements')
      .where('sourceCaseId', '==', caseId)
      .limit(50)
      .get(),
  ]);
  if (!snapshot.exists) fail('not-found', 'Moderation case was not found.', 'case_missing');
  const [item] = await hydrateModerationPreviews(admin, [{
    id: snapshot.id,
    ...snapshot.data(),
  }]);
  const ownerId = item.targetOwnerId || (item.target?.type === 'profile' ? item.target.id : '');
  const ownerSnapshot = ownerId ? await admin.firestore().doc(`users/${ownerId}`).get() : null;
  const recentGroups = ownerId
    ? await Promise.all(['recommendations', 'routes', 'trips'].map((collectionName) => (
        admin.firestore().collection(collectionName).where('ownerId', '==', ownerId).limit(5).get()
      )))
    : [];
  const recentContent = recentGroups.flatMap((group, index) => group.docs.map((entry) => ({
    type: ['recommendation', 'route', 'trip'][index],
    id: entry.id,
    title: cleanOptionalText(entry.data()?.title, 180),
    status: cleanOptionalText(entry.data()?.status, 40),
    updatedAt: entry.data()?.updatedAt || null,
  }))).slice(0, 12);
  const ownerData = ownerSnapshot?.exists ? ownerSnapshot.data() || {} : null;
  return serialize({
    ...publicModerationCase(item),
    reports: reports.docs.map(publicModerationReport),
    events: events.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    enforcements: enforcements.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    subjectUser: ownerData ? {
      uid: ownerId,
      displayName: cleanOptionalText(ownerData.displayName, 80),
      status: cleanOptionalText(ownerData.moderation?.status, 40) || 'active',
      suspensionEndsAt: ownerData.moderation?.suspensionEndsAt || null,
      createdAt: ownerData.createdAt || null,
    } : null,
    recentContent,
  });
}

async function updateModerationCase({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'updateModerationCase');
  const caseId = cleanText(data?.caseId, 'caseId', 180);
  const revision = expectedRevision(data?.expectedRevision);
  const operation = cleanEnum(
    data?.operation,
    ['claim', 'unclaim', 'set_priority', 'add_note'],
    'operation'
  );
  const db = admin.firestore();
  const ref = db.doc(`system/moderation/cases/${caseId}`);
  const eventRef = caseEventRef(db, caseId);
  const actor = actorProjection(auth);
  let updated;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) fail('not-found', 'Moderation case was not found.', 'case_missing');
    const previous = snapshot.data() || {};
    if (previous.status === 'resolving') {
      fail('aborted', 'The moderation case is being resolved by another admin.', 'case_revision_conflict');
    }
    if (Math.max(0, Number(previous.revision || 0)) !== revision) {
      fail('aborted', 'The moderation case changed.', 'case_revision_conflict');
    }
    const patch = {
      revision: revision + 1,
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const event = {
      type: operation,
      actor,
      revision: revision + 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (operation === 'claim') {
      patch.assignment = {
        uid: actor.uid,
        displayName: actor.displayName,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      patch.assignmentUid = actor.uid;
    } else if (operation === 'unclaim') {
      patch.assignment = admin.firestore.FieldValue.delete();
      patch.assignmentUid = '';
    } else if (operation === 'set_priority') {
      patch.priority = cleanEnum(data?.priority, ['normal', 'urgent'], 'priority');
      event.priority = patch.priority;
    } else {
      event.note = cleanText(data?.note, 'note', 1000);
    }
    transaction.set(ref, patch, { merge: true });
    transaction.set(eventRef, event);
    updated = { id: snapshot.id, ...previous, ...patch };
  });
  await audit({
    admin,
    auth,
    action: `moderation_case_${operation}`,
    target: { caseId },
    reason: operation === 'add_note' ? 'הערה פנימית' : 'עדכון תיק',
  });
  return serialize(publicModerationCase(updated));
}

function cleanSavedViewFilters(value) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const key of ['statuses', 'targetTypes', 'priorities', 'categories']) {
    if (!Array.isArray(source[key])) continue;
    result[key] = Array.from(new Set(source[key]
      .map((entry) => cleanOptionalText(entry, 80))
      .filter(Boolean))).slice(0, 12);
  }
  if (typeof source.assignee === 'string') result.assignee = cleanOptionalText(source.assignee, 180);
  if (typeof source.query === 'string') result.query = cleanOptionalText(source.query, 120);
  for (const key of ['reportedAfter', 'reportedBefore']) {
    if (typeof source[key] === 'string' && Number.isFinite(Date.parse(source[key]))) {
      result[key] = new Date(source[key]).toISOString();
    }
  }
  if (['needs_action', 'urgent', 'overdue', 'mine', 'unassigned', 'held', 'history'].includes(source.view)) {
    result.view = source.view;
  }
  if (['due_asc', 'reports_desc', 'updated_desc'].includes(source.sort)) result.sort = source.sort;
  const minimumReports = Math.trunc(Number(source.minimumReports) || 0);
  if (minimumReports > 0) result.minimumReports = Math.min(1000, minimumReports);
  return result;
}

async function listAdminSavedViews({ admin, auth }) {
  await prepareAdminAction(admin, auth, 'listAdminSavedViews');
  const snapshot = await admin.firestore()
    .collection(`system/moderation/admins/${auth.uid}/savedViews`)
    .orderBy('updatedAt', 'desc')
    .limit(20)
    .get();
  return { items: snapshot.docs.map((entry) => serialize({ id: entry.id, ...entry.data() })) };
}

async function saveAdminSavedView({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'saveAdminSavedView');
  const id = data?.id ? cleanText(data.id, 'id', 80) : crypto.randomBytes(12).toString('base64url');
  const name = cleanText(data?.name, 'name', 40);
  const filters = cleanSavedViewFilters(data?.filters);
  const ref = admin.firestore().doc(`system/moderation/admins/${auth.uid}/savedViews/${id}`);
  await ref.set({
    name,
    filters,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id, name, filters };
}

async function deleteAdminSavedView({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'deleteAdminSavedView');
  const id = cleanText(data?.id, 'id', 80);
  await admin.firestore().doc(`system/moderation/admins/${auth.uid}/savedViews/${id}`).delete();
  return { id, deleted: true };
}

async function searchAdminResources({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'searchAdminResources');
  const raw = cleanOptionalText(data?.query, 120);
  const normalized = normalizeSearchText(raw);
  const terms = Array.from(new Set(normalized.split(' ').filter((term) => term.length >= 2))).slice(0, 6);
  const types = new Set((Array.isArray(data?.types) ? data.types : [])
    .map((value) => String(value || '').trim()).filter(Boolean));
  const statuses = new Set((Array.isArray(data?.statuses) ? data.statuses : [])
    .map((value) => String(value || '').trim()).filter(Boolean));
  if (raw.includes('@')) {
    try {
      const user = await admin.auth().getUserByEmail(raw.toLowerCase());
      const item = publicAdminUser(user);
      return {
        items: types.size && !types.has('profile') ? [] : [{
          id: `profile_${item.uid}`,
          type: 'profile',
          target: { type: 'profile', id: item.uid, path: `publicProfiles/${item.uid}` },
          title: item.displayName || item.email,
          subtitle: item.email,
          status: item.disabled ? 'suspended' : 'active',
        }],
        nextCursor: null,
      };
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
      return { items: [], nextCursor: null };
    }
  }
  let query = admin.firestore().collection('system/moderation/search');
  if (terms.length) query = query.where('search.prefixes', 'array-contains', terms[0].slice(0, 16));
  query = query.orderBy('updatedAt', 'desc').limit(PAGE_SIZE * 2);
  if (data?.cursor) {
    const cursor = await admin.firestore().doc(`system/moderation/search/${cleanText(data.cursor, 'cursor', 180)}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  const filtered = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((item) => (
      (!types.size || types.has(item.type))
      && (!statuses.size || statuses.has(item.status))
      && terms.every((term) => (item.search?.prefixes || []).includes(term.slice(0, 16)))
    ));
  const items = filtered.slice(0, PAGE_SIZE);
  const bufferedCursor = filtered.length > PAGE_SIZE ? items.at(-1)?.id : null;
  return {
    items: items.map(serialize),
    nextCursor: bufferedCursor
      || (snapshot.size === PAGE_SIZE * 2 ? snapshot.docs.at(-1)?.id || null : null),
  };
}

async function getAdminResource({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getAdminResource');
  const target = normalizeReportTarget(data?.target);
  const path = canonicalTargetPath(target);
  const sourcePath = target.type === 'profile' ? `users/${target.id}` : path;
  const snapshot = await admin.firestore().doc(sourcePath).get();
  if (!snapshot.exists) fail('not-found', 'Admin resource was not found.', 'content_missing');
  let subjectData = null;
  if (target.type === 'route' && target.subject?.kind === 'attached_place') {
    const revisionId = cleanOptionalText(snapshot.data()?.activeRevisionId, 180);
    if (!revisionId) fail('not-found', 'The attached route place is unavailable.', 'content_missing');
    const subjectSnapshot = await admin.firestore().doc(
      `routes/${target.id}/revisions/${revisionId}/days/${target.subject.dayId}/stops/${target.subject.stopId}`
    ).get();
    if (!subjectSnapshot.exists) fail('not-found', 'The attached route place is unavailable.', 'content_missing');
    subjectData = subjectSnapshot.data() || {};
  }
  const parentSnapshot = target.type === 'comment'
    ? await admin.firestore().doc(path.split('/').slice(0, 2).join('/')).get()
    : null;
  const ownerId = target.type === 'profile'
    ? target.id
    : snapshot.data()?.authorId || snapshot.data()?.ownerId || '';
  const ownerProfile = ownerId
    ? await admin.firestore().doc(`publicProfiles/${ownerId}`).get()
    : null;
  const caseId = caseIdForTarget(target);
  const caseSnapshot = await admin.firestore().doc(`system/moderation/cases/${caseId}`).get();
  const sourceData = snapshot.data() || {};
  const previewData = target.type === 'profile'
    ? { ...sourceData, status: sourceData.moderation?.status || sourceData.status }
    : subjectData ? { ...sourceData, place: subjectData.place, attachedPlace: subjectData } : sourceData;
  return serialize({
    target,
    preview: buildModerationPreview({
      target,
      data: previewData,
      parentData: parentSnapshot?.exists ? parentSnapshot.data() : null,
      ownerProfile: ownerProfile?.exists ? ownerProfile.data() : null,
    }),
    case: caseSnapshot.exists ? publicModerationCase({ id: caseId, ...caseSnapshot.data() }) : null,
  });
}

async function getModerationPolicy({ admin, auth }) {
  await prepareAdminAction(admin, auth, 'getModerationPolicy');
  return publicModerationPolicy();
}

function compactPlaceAudit(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    placeId: cleanOptionalText(value.placeId, 220),
    name: cleanOptionalText(value.name, 200),
    address: cleanOptionalText(value.address, 500),
    coordinates: value.coordinates && Number.isFinite(Number(value.coordinates.lat))
      && Number.isFinite(Number(value.coordinates.lng))
      ? { lat: Number(value.coordinates.lat), lng: Number(value.coordinates.lng) }
      : null,
  };
}

function adminMapLocation(admin, coordinates) {
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    geopoint: new admin.firestore.GeoPoint(lat, lng),
    geohash: geohashForLocation([lat, lng]),
  };
}

function recommendationSearchWithPlace(root, place) {
  return buildSearchIndex({
    title: root.title,
    description: root.description,
    destination: root.destination,
    place,
    categoryIds: root.categoryId ? [root.categoryId] : root.categoryIds,
    subcategoryIds: root.subcategoryIds || root.tags,
    interestIds: Array.from(new Set([
      ...(Array.isArray(root.facets?.interests) ? root.facets.interests : []),
      ...(Array.isArray(root.catalogInterestIds) ? root.catalogInterestIds : []),
    ])),
  });
}

function routeStopSummaryLabel(stop) {
  if (stop?.locationPrecision === 'general') return cleanOptionalText(stop.destination?.cityName, 200);
  return cleanOptionalText(stop?.location || stop?.place?.name || stop?.destination?.cityName, 200);
}

async function routePlaceProjectionPatch({ db, transaction, target, activeRevisionId, sourceRef, source, root, nextPlace, action }) {
  const nextLocation = action === 'replace'
    ? cleanOptionalText(nextPlace?.name, 200)
      || cleanOptionalText(source.destination?.cityName || source.destination?.cityId, 200)
    : cleanOptionalText(source.destination?.cityName || source.destination?.cityId, 200);
  const nextSource = {
    ...source,
    place: action === 'replace' ? nextPlace : null,
    coordinates: action === 'replace' ? nextPlace.coordinates : null,
    locationPrecision: action === 'replace' ? 'exact' : 'general',
    location: nextLocation,
  };
  const days = await transaction.get(db.collection(`routes/${target.id}/revisions/${activeRevisionId}/days`));
  const stopGroups = [];
  for (const day of days.docs) {
    stopGroups.push(await transaction.get(day.ref.collection('stops')));
  }
  const summaryPlaces = Array.from(new Set(stopGroups.flatMap((group) => group.docs.map((entry) => (
    routeStopSummaryLabel(entry.ref.path === sourceRef.path ? nextSource : entry.data() || {})
  )).filter(Boolean)))).slice(0, 30);
  return {
    sourcePatch: action === 'replace' ? {
      place: nextPlace,
      coordinates: nextPlace.coordinates,
      locationPrecision: 'exact',
      location: nextLocation,
    } : {
      place: null,
      coordinates: null,
      locationPrecision: 'general',
      location: nextLocation,
    },
    rootPatch: {
      summaryPlaces,
      search: buildSearchIndex({
        title: root.title,
        description: `${root.description || ''} ${summaryPlaces.join(' ')}`,
        destinations: root.destinations,
        categoryIds: root.categoryIds,
        subcategoryIds: root.subcategoryIds,
        interestIds: root.facets?.interests,
      }),
    },
  };
}

async function updateAdminAttachedPlace({ admin, auth, data, providerRateLimitKey }) {
  await prepareAdminAction(admin, auth, 'updateAdminAttachedPlace');
  const target = normalizeReportTarget(data?.target);
  if (!['recommendation', 'route'].includes(target.type) || target.subject?.kind !== 'attached_place') {
    fail('invalid-argument', 'An attached recommendation or route place is required.', 'invalid_target');
  }
  const action = cleanEnum(data?.action, ['replace', 'city_only'], 'action');
  const reason = cleanText(data?.reason, 'reason', 500);
  const caseId = cleanOptionalText(data?.caseId, 180);
  const revision = caseId ? expectedRevision(data?.expectedRevision) : null;
  const db = admin.firestore();
  const rootRef = db.doc(target.path);
  let resolvedDestination = null;
  let nextPlace = null;
  if (action === 'replace') {
    const resolved = await readResolvedPlaceToken({
      admin,
      auth,
      resolvedPlaceToken: cleanText(data?.resolvedPlaceToken, 'resolvedPlaceToken', 500),
      providerRateLimitKey,
    });
    resolvedDestination = resolved.destinationResolution;
    if (
      !resolvedDestination?.place?.placeId
      || !resolvedDestination.place.coordinates
    ) {
      fail('failed-precondition', 'The verified place does not match the content city.', 'place_destination_mismatch');
    }
    nextPlace = resolvedDestination.place;
  }
  const caseRef = caseId ? db.doc(`system/moderation/cases/${caseId}`) : null;
  const eventRef = caseId ? caseEventRef(db, caseId) : null;
  let nextRevision = revision;
  let beforePlace = null;
  await db.runTransaction(async (transaction) => {
    const rootSnapshot = await transaction.get(rootRef);
    if (!rootSnapshot.exists) fail('not-found', 'The moderated content is unavailable.', 'content_missing');
    const root = rootSnapshot.data() || {};
    let sourceRef = rootRef;
    let currentSource = rootSnapshot;
    if (target.type === 'route') {
      const activeRevisionId = cleanText(root.activeRevisionId, 'activeRevisionId', 180);
      sourceRef = db.doc(`routes/${target.id}/revisions/${activeRevisionId}/days/${target.subject.dayId}/stops/${target.subject.stopId}`);
      currentSource = await transaction.get(sourceRef);
      if (!currentSource.exists) fail('not-found', 'The attached route place is unavailable.', 'content_missing');
    }
    const caseSnapshot = caseRef ? await transaction.get(caseRef) : null;
    const source = currentSource.data() || {};
    const currentDestination = target.type === 'route' ? source.destination : root.destination;
    if (!currentDestination?.countryId || !currentDestination?.cityId) {
      fail('failed-precondition', 'The attached place has no canonical city.', 'invalid_target');
    }
    if (
      resolvedDestination
      && (
        resolvedDestination.countryId !== currentDestination.countryId
        || resolvedDestination.cityId !== currentDestination.cityId
      )
    ) {
      fail('failed-precondition', 'The verified place does not match the content city.', 'place_destination_mismatch');
    }
    if (caseRef) {
      if (!caseSnapshot.exists) fail('not-found', 'The moderation case was not found.', 'case_missing');
      const caseData = caseSnapshot.data() || {};
      if (caseData.status === 'resolving' || Math.max(0, Number(caseData.revision || 0)) !== revision) {
        fail('aborted', 'The moderation case changed.', 'case_revision_conflict');
      }
      if (
        caseData.target?.path !== target.path
        || caseData.target?.subject?.kind !== 'attached_place'
        || (caseData.target?.subject?.dayId || '') !== (target.subject?.dayId || '')
        || (caseData.target?.subject?.stopId || '') !== (target.subject?.stopId || '')
      ) {
        fail('invalid-argument', 'The place does not match the moderation case.', 'invalid_target');
      }
    }
    beforePlace = source.place || null;
    if (target.type === 'recommendation') {
      transaction.update(sourceRef, action === 'replace' ? {
        place: nextPlace,
        locationMode: 'exact',
        mapLocation: adminMapLocation(admin, nextPlace.coordinates),
        search: recommendationSearchWithPlace(root, nextPlace),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      } : {
        place: null,
        locationMode: 'destination',
        mapLocation: null,
        search: recommendationSearchWithPlace(root, null),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const projection = await routePlaceProjectionPatch({
        db,
        transaction,
        target,
        activeRevisionId: root.activeRevisionId,
        sourceRef,
        source,
        root,
        nextPlace,
        action,
      });
      transaction.update(sourceRef, projection.sourcePatch);
      transaction.update(rootRef, {
        ...projection.rootPatch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (caseRef) {
      nextRevision = revision + 1;
      transaction.set(caseRef, {
        revision: nextRevision,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(eventRef, {
        type: 'attached_place_updated',
        actor: actorProjection(auth),
        revision: nextRevision,
        action,
        reason,
        before: compactPlaceAudit(beforePlace),
        after: compactPlaceAudit(nextPlace),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
  await audit({
    admin,
    auth,
    action: action === 'replace' ? 'attached_place_replaced' : 'attached_place_city_only',
    target,
    reason,
    metadata: { before: compactPlaceAudit(beforePlace), after: compactPlaceAudit(nextPlace), caseId },
  });
  return serialize({ success: true, action, caseId: caseId || null, revision: nextRevision, place: nextPlace });
}

async function listHeldContent({ admin, auth }) {
  await prepareAdminAction(admin, auth, 'listHeldContent');
  const db = admin.firestore();
  const groups = await Promise.all([
    ['recommendation', db.collection('recommendations').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
    ['route', db.collection('routes').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
    ['trip', db.collection('trips').where('status', '==', 'moderation_hold').limit(PAGE_SIZE).get()],
  ].map(async ([type, promise]) => [type, await promise]));
  const items = groups.flatMap(([type, snapshot]) => snapshot.docs.map((entry) => ({
    id: `content_${type}_${entry.id}`,
    target: { type, id: entry.id, path: entry.ref.path },
    targetOwnerId: entry.data()?.ownerId || null,
    title: entry.data()?.title || '',
    status: entry.data()?.status,
    priority: 'normal',
    updatedAt: entry.data()?.updatedAt || null,
    targetPreview: buildModerationPreview({
      target: { type, id: entry.id, path: entry.ref.path },
      data: entry.data(),
    }),
  })));
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { items: items.slice(0, PAGE_SIZE).map(serialize), nextCursor: null };
}

async function syncRootReplyModeration({ admin, parentRef, rootId, rootPath, action, reason, actorUid }) {
  let cursor = null;
  let changed = 0;
  while (true) {
    let query = parentRef.collection('comments')
      .where('threadRootId', '==', rootId)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(400);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const replies = snapshot.docs.filter((entry) => {
      const value = entry.data() || {};
      if (entry.id === rootId || value.threadType !== 'reply') return false;
      if (action === 'hold') return value.status === 'active';
      return value.status === 'moderation_hold'
        && value.threadModeration?.rootPath === rootPath;
    });
    const batch = admin.firestore().batch();
    replies.forEach((entry) => {
      batch.update(entry.ref, action === 'hold' ? {
        status: 'moderation_hold',
        threadModeration: {
          rootPath,
          action: 'hold',
          reason,
          actorUid,
          at: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      } : {
        status: 'active',
        threadModeration: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    if (replies.length) await batch.commit();
    changed += replies.length;
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 400) break;
  }
  return changed;
}

async function moderateContent({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'moderateContent');
  const reason = cleanText(data?.reason, 'reason');
  const action = String(data?.action || '');
  if (!['dismiss', 'hold', 'restore', 'delete'].includes(action)) fail('invalid-argument', 'Invalid moderation action.', 'invalid_action');
  const target = normalizeReportTarget(data?.target);
  if (!['recommendation', 'route', 'trip', 'comment'].includes(target.type)) {
    fail('invalid-argument', 'Target cannot be moderated here.', 'invalid_target');
  }
  const db = admin.firestore();
  const caseId = data?.caseId ? cleanText(data.caseId, 'caseId', 180) : null;
  const caseRef = caseId ? db.doc(`system/moderation/cases/${caseId}`) : null;
  if (action === 'dismiss' && !caseId) {
    fail('invalid-argument', 'A moderation case is required to dismiss a report.', 'case_required');
  }
  let caseSnapshot = null;
  let caseRevision = null;
  if (caseId) {
    caseSnapshot = await caseRef.get();
    if (!caseSnapshot.exists) fail('not-found', 'Moderation case was not found.', 'case_missing');
    const caseData = caseSnapshot.data() || {};
    if (caseData.status === 'resolving') {
      fail('aborted', 'The moderation case changed.', 'case_revision_conflict');
    }
    caseRevision = Math.max(0, Number(caseData.revision || 0));
    if (data?.expectedRevision != null && expectedRevision(data.expectedRevision) !== caseRevision) {
      fail('aborted', 'The moderation case changed.', 'case_revision_conflict');
    }
    const caseTarget = normalizeReportTarget(caseData.target);
    if (caseTarget.path !== target.path) fail('invalid-argument', 'Moderation target does not match the case.', 'invalid_target');
  }
  const finalizeCase = async () => {
    if (!caseRef) return;
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(caseRef);
      const currentData = current.exists ? current.data() || {} : {};
      const currentRevision = Math.max(0, Number(currentData.revision || 0));
      if (!current.exists || currentData.status === 'resolving' || currentRevision !== caseRevision) {
        fail('aborted', 'The moderation case changed.', 'case_revision_conflict');
      }
      const nextRevision = currentRevision + 1;
      transaction.set(caseRef, {
        status: action === 'dismiss'
          ? 'resolved_dismissed'
          : action === 'restore'
            ? 'resolved_restored'
            : action === 'delete'
              ? 'resolved_deleted'
              : 'resolved_held',
        revision: nextRevision,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: auth.uid,
        resolutionReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(caseEventRef(db, caseId), {
        type: 'legacy_content_decision',
        actor: actorProjection(auth),
        revision: nextRevision,
        contentAction: action,
        reason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  };
  const targetSnapshot = await db.doc(target.path).get();
  if (!targetSnapshot.exists) {
    if (action === 'delete') {
      const outboxId = ownerNotificationOutboxId('content_deleted', target.path);
      const outbox = await db.doc(
        `system/moderation/ownerNotifications/${outboxId}`
      ).get();
      let recovered = null;
      if (outbox.exists) {
        await purgeNotificationsForTarget({
          admin,
          targetPath: target.path,
          includeDescendants: true,
        });
        recovered = await completeOwnerNotificationOutbox({
          admin,
          subtype: 'content_deleted',
          targetPath: target.path,
        });
      }
      if (recovered) {
        await finalizeCase();
        await audit({ admin, auth, action: 'content_delete', target, reason });
        return { success: true, action, target, recovered: true };
      }
    }
    fail('not-found', 'Moderated content is no longer available.', 'content_missing');
  }
  const targetData = targetSnapshot.data() || {};
  const targetOwnerId = target.type === 'comment' ? targetData.authorId : targetData.ownerId;
  const casePreview = caseSnapshot?.data()?.targetPreview || null;
  const notificationTarget = buildNotificationTarget({
    target: {
      ...target,
      title: casePreview?.title,
      thumbUrls: [casePreview?.thumbUrl, casePreview?.imageUrl].filter(Boolean),
    },
    data: targetData,
    parentData: target.type === 'comment' ? casePreview : null,
  });
  if (action === 'dismiss' && targetSnapshot.data()?.status !== 'active') {
    fail('failed-precondition', 'Only published content can remain published.', 'content_not_active');
  }
  if (action === 'restore') {
    const restoredRetry = targetData.status === 'active'
      && targetData.moderation?.lastAction === 'restore';
    if (targetData.status !== 'moderation_hold' && !restoredRetry) {
      fail('failed-precondition', 'Only held content can be restored.', 'content_not_held');
    }
    const snapshot = targetSnapshot;
    const ownerId = target.type === 'comment' ? snapshot.data()?.authorId : snapshot.data()?.ownerId;
    if (ownerId) {
      const owner = await admin.firestore().doc(`users/${ownerId}`).get();
      if (owner.data()?.moderation?.status === 'suspended') {
        fail('failed-precondition', 'Suspended-user content cannot be restored.', 'owner_suspended');
      }
    }
  }
  if (action === 'dismiss') {
    // Dismissing a report deliberately leaves the already-published target unchanged.
  } else if (action === 'delete') {
    const deletionOutbox = targetOwnerId
      ? await prepareOwnerNotificationOutbox({
        admin,
        uid: targetOwnerId,
        subtype: 'content_deleted',
        target: notificationTarget,
      })
      : null;
    if (target.type === 'comment') {
      await deleteComment({
        admin,
        auth,
        data: { target: { type: target.parentType, id: target.parentId }, commentId: target.id },
      });
    } else {
      await deleteContentInternal({ admin, target, actorUid: auth.uid, isAdmin: true, mediaBucket });
    }
    if (deletionOutbox) {
      await completeOwnerNotificationOutbox({
        admin,
        subtype: 'content_deleted',
        targetPath: target.path,
        version: deletionOutbox.version,
      });
    }
  } else {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(db.doc(target.path));
      if (!current.exists) fail('not-found', 'Moderated content is no longer available.', 'content_missing');
      const currentData = current.data() || {};
      const desiredStatus = action === 'restore' ? 'active' : 'moderation_hold';
      const alreadyApplied = currentData.status === desiredStatus;
      if (action === 'restore'
        && alreadyApplied
        && currentData.moderation?.lastAction !== 'restore') {
        fail('failed-precondition', 'Only held content can be restored.', 'content_not_held');
      }
      if (action === 'restore'
        && !alreadyApplied
        && currentData.status !== 'moderation_hold') {
        fail('failed-precondition', 'Only held content can be restored.', 'content_not_held');
      }
      if (action === 'hold'
        && !alreadyApplied
        && currentData.status !== 'active') {
        fail('failed-precondition', 'Only published content can be held.', 'content_not_active');
      }
      if (action === 'restore'
        && target.type === 'comment'
        && currentData.threadType === 'reply') {
        const rootId = typeof currentData.threadRootId === 'string'
          ? currentData.threadRootId.trim()
          : '';
        const parentPath = target.path.split('/').slice(0, 2).join('/');
        const rootSnapshot = rootId
          ? await transaction.get(db.doc(`${parentPath}/comments/${rootId}`))
          : null;
        if (!rootSnapshot?.exists || rootSnapshot.data()?.status !== 'active') {
          fail(
            'failed-precondition',
            'A reply cannot be restored while its thread is unavailable.',
            'thread_not_active'
          );
        }
      }
      const currentOwnerId = target.type === 'comment'
        ? currentData.authorId
        : currentData.ownerId;
      const subtype = action === 'restore' ? 'content_restored' : 'content_held';
      const notificationRef = !alreadyApplied && currentOwnerId
        ? db.doc(
          `users/${currentOwnerId}/notifications/${systemNotificationId(subtype, target.path)}`
        )
        : null;
      const [notificationSnapshot, ownerSnapshot] = notificationRef
        ? await Promise.all([
          transaction.get(notificationRef),
          transaction.get(db.doc(`users/${currentOwnerId}`)),
        ])
        : [null, null];
      transaction.update(db.doc(target.path), {
        status: desiredStatus,
        moderation: {
          lastAction: action,
          reason,
          actorUid: auth.uid,
          at: admin.firestore.FieldValue.serverTimestamp(),
        },
        ...(action === 'hold'
          && target.type === 'comment'
          && currentData.threadType === 'reply'
          ? { threadModeration: admin.firestore.FieldValue.delete() }
          : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (notificationRef && notificationSnapshot && notificationRecipientEligible(ownerSnapshot)) {
        stageNotificationActivity({
          transaction,
          admin,
          db,
          uid: currentOwnerId,
          notificationRef,
          existingSnapshot: notificationSnapshot,
          notification: {
            channel: 'personal',
            type: 'system',
            subtype,
            priority: 'normal',
            count: 1,
            target: notificationTarget,
            navigation: navigationForTarget(target),
          },
        });
      }
    });
    if (target.type !== 'comment') {
      await setMediaAvailability({
        admin,
        data: targetSnapshot.data(),
        mediaBucket,
        available: action === 'restore',
        reason: action === 'hold' ? reason : null,
      });
    } else if (targetData.threadType !== 'reply') {
      const parentRef = db.doc(target.path.split('/').slice(0, 2).join('/'));
      await syncRootReplyModeration({
        admin,
        parentRef,
        rootId: target.id,
        rootPath: target.path,
        action,
        reason,
        actorUid: auth.uid,
      });
    }
  }
  if (target.type === 'comment' && action !== 'dismiss') {
    const parentRef = db.doc(`${target.path.split('/').slice(0, 2).join('/')}`);
    const activeComments = await parentRef.collection('comments').where('status', '==', 'active').count().get();
    await parentRef.update({
      'stats.commentCount': activeComments.data().count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
    if (targetData.threadType === 'reply' && targetData.threadRootId) {
      const rootRef = parentRef.collection('comments').doc(targetData.threadRootId);
      const activeReplies = await parentRef.collection('comments')
        .where('status', '==', 'active')
        .where('threadType', '==', 'reply')
        .where('threadRootId', '==', targetData.threadRootId)
        .count()
        .get();
      await rootRef.update({
        replyCount: activeReplies.data().count,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    } else if (action !== 'delete') {
      const activeReplies = await parentRef.collection('comments')
        .where('status', '==', 'active')
        .where('threadType', '==', 'reply')
        .where('threadRootId', '==', target.id)
        .count()
        .get();
      await parentRef.collection('comments').doc(target.id).update({
        replyCount: activeReplies.data().count,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  }
  await finalizeCase();
  await audit({ admin, auth, action: `content_${action}`, target, reason });
  return { success: true, action, target };
}

async function resolveModerationCase({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'resolveModerationCase');
  const db = admin.firestore();
  const requestedTarget = data?.target ? normalizeReportTarget(data.target) : null;
  const suppliedCaseId = cleanOptionalText(data?.caseId, 180);
  const caseId = suppliedCaseId || (requestedTarget ? caseIdForTarget(requestedTarget) : '');
  if (!caseId) fail('invalid-argument', 'A moderation case or target is required.', 'invalid_input');
  const revision = expectedRevision(data?.expectedRevision);
  const contentAction = cleanEnum(data?.contentAction || 'none', CONTENT_ACTIONS, 'contentAction');
  const account = data?.accountAction && typeof data.accountAction === 'object'
    ? data.accountAction
    : { type: data?.accountAction || 'none' };
  const accountAction = cleanEnum(account.type || 'none', ACCOUNT_ACTIONS, 'accountAction');
  if (contentAction === 'none' && accountAction === 'none') {
    fail('invalid-argument', 'A moderation decision must include an action.', 'invalid_input');
  }
  const reasonCode = cleanOptionalText(data?.reasonCode, 80);
  const reasonDefinition = policyReason(reasonCode);
  if (!reasonDefinition) fail('invalid-argument', 'Moderation reason is invalid.', 'invalid_input');
  if (reasonCode === 'no_violation' && (contentAction !== 'dismiss' || accountAction !== 'none')) {
    fail('invalid-argument', 'No-violation reason cannot enforce content or account actions.', 'invalid_input');
  }
  const userDetail = cleanOptionalText(data?.userDetail, 240);
  const internalNote = cleanOptionalText(data?.internalNote, 1000);
  const userMessage = [reasonDefinition.userMessage, userDetail].filter(Boolean).join(' ').slice(0, 240);
  const caseRef = db.doc(`system/moderation/cases/${caseId}`);
  const leaseId = crypto.randomBytes(16).toString('base64url');
  const leaseRevision = revision + 1;
  const actor = actorProjection(auth);
  let target;
  let ownerId = '';
  let previousStatus = 'open';
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(caseRef);
    const previous = snapshot.exists ? snapshot.data() || {} : {};
    const currentRevision = Math.max(0, Number(previous.revision || 0));
    if (currentRevision !== revision) {
      fail('aborted', 'The moderation case changed.', 'case_revision_conflict');
    }
    const leaseStartedAtMs = Number(previous.decisionLease?.startedAtMs || 0);
    if (previous.status === 'resolving' && Date.now() - leaseStartedAtMs < RECENT_AUTH_SECONDS * 1000) {
      fail('aborted', 'The moderation case is being resolved by another admin.', 'case_revision_conflict');
    }
    target = snapshot.exists ? normalizeReportTarget(previous.target) : requestedTarget;
    if (!target) fail('invalid-argument', 'A moderation target is required.', 'invalid_target');
    if (requestedTarget && requestedTarget.path !== target.path) {
      fail('invalid-argument', 'Moderation target does not match the case.', 'invalid_target');
    }
    previousStatus = previous.status || 'open';
    ownerId = previous.targetOwnerId || (target.type === 'profile' ? target.id : '');
    let targetPreview = previous.targetPreview || null;
    if (!snapshot.exists) {
      const targetSourcePath = target.type === 'profile' ? `users/${target.id}` : target.path;
      const targetSnapshot = await transaction.get(db.doc(targetSourcePath));
      if (!targetSnapshot.exists) fail('not-found', 'Moderated content is unavailable.', 'content_missing');
      const rawTargetData = targetSnapshot.data() || {};
      const targetData = target.type === 'profile'
        ? { ...rawTargetData, status: rawTargetData.moderation?.status || rawTargetData.status }
        : rawTargetData;
      ownerId = target.type === 'profile'
        ? target.id
        : target.type === 'comment'
          ? targetData.authorId || ''
          : targetData.ownerId || '';
      targetPreview = buildModerationPreview({ target, data: targetData });
    }
    transaction.set(caseRef, {
      caseId,
      target,
      ...(ownerId ? { targetOwnerId: ownerId } : {}),
      targetPreview,
      source: previous.source || 'admin',
      status: 'resolving',
      priority: previous.priority || 'normal',
      reportCount: Number(previous.reportCount || 0),
      assignment: previous.assignment || {
        uid: actor.uid,
        displayName: actor.displayName,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      assignmentUid: previous.assignmentUid || actor.uid,
      revision: leaseRevision,
      decisionLease: { id: leaseId, actorUid: actor.uid, startedAtMs: Date.now() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(caseEventRef(db, caseId), {
      type: 'decision_started',
      actor,
      revision: leaseRevision,
      contentAction,
      accountAction,
      reasonCode,
      ...(internalNote ? { note: internalNote } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  try {
    if (['hold', 'restore', 'delete'].includes(contentAction)) {
      if (!['recommendation', 'route', 'trip', 'comment'].includes(target.type)) {
        fail('invalid-argument', 'This target does not support content enforcement.', 'invalid_target');
      }
      await moderateContent({
        admin,
        auth,
        data: { target, action: contentAction, reason: reasonDefinition.label },
        mediaBucket,
      });
    } else if (contentAction === 'dismiss' && ['recommendation', 'route', 'trip', 'comment'].includes(target.type)) {
      const targetSnapshot = await db.doc(target.path).get();
      if (!targetSnapshot.exists) fail('not-found', 'Moderated content is unavailable.', 'content_missing');
      if (targetSnapshot.data()?.status !== 'active') {
        fail('failed-precondition', 'Only published content can remain published.', 'content_not_active');
      }
    }

    let enforcement = null;
    if (accountAction !== 'none') {
      if (!ownerId) fail('failed-precondition', 'The case has no user to enforce.', 'target_owner_missing');
      if (accountAction === 'warn') {
        enforcement = await warnUser({
          admin,
          auth,
          uid: ownerId,
          sourceCaseId: caseId,
          reasonCode,
          userMessage,
          internalNote,
        });
      } else {
        const durationHours = accountAction === 'suspend' && account.durationHours != null
          ? Number(account.durationHours)
          : null;
        enforcement = await setUserSuspension({
          admin,
          auth,
          data: {
            identifier: ownerId,
            suspended: accountAction === 'suspend',
            durationHours,
            reason: reasonDefinition.label,
            reasonCode,
            userMessage,
            internalNote,
            sourceCaseId: caseId,
          },
          mediaBucket,
        });
      }
    }

    const resolvedStatus = accountAction !== 'none'
      ? 'resolved_actioned'
      : contentAction === 'dismiss'
        ? 'resolved_dismissed'
        : contentAction === 'hold'
          ? 'resolved_held'
          : contentAction === 'restore'
            ? 'resolved_restored'
            : 'resolved_deleted';
    const resolution = {
      contentAction,
      accountAction,
      reasonCode,
      userMessage,
      internalNote,
      ...(enforcement?.enforcementId ? { enforcementId: enforcement.enforcementId } : {}),
    };
    const finalRevision = revision + 2;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(caseRef);
      const current = snapshot.exists ? snapshot.data() || {} : {};
      if (
        !snapshot.exists
        || current.status !== 'resolving'
        || Math.max(0, Number(current.revision || 0)) !== leaseRevision
        || current.decisionLease?.id !== leaseId
      ) {
        fail('aborted', 'The moderation case changed.', 'case_revision_conflict');
      }
      transaction.set(caseRef, {
        status: resolvedStatus,
        revision: finalRevision,
        resolution,
        resolutionReason: reasonDefinition.label,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: auth.uid,
        decisionLease: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(caseEventRef(db, caseId), {
        type: 'decision_completed',
        actor,
        revision: finalRevision,
        resolution,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await audit({
      admin,
      auth,
      action: 'moderation_case_resolved',
      target: { caseId, ...target },
      reason: reasonDefinition.label,
      metadata: { contentAction, accountAction },
    });
    return serialize({ caseId, revision: finalRevision, status: resolvedStatus, resolution });
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(caseRef);
      const currentData = current.exists ? current.data() || {} : {};
      if (
        !current.exists
        || currentData.status !== 'resolving'
        || Math.max(0, Number(currentData.revision || 0)) !== leaseRevision
        || currentData.decisionLease?.id !== leaseId
      ) return;
      transaction.set(caseRef, {
        status: previousStatus,
        revision: revision + 2,
        decisionLease: admin.firestore.FieldValue.delete(),
        resolutionError: error?.details?.reason || 'operation_failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(caseEventRef(db, caseId), {
        type: 'decision_failed',
        actor,
        revision: revision + 2,
        reason: error?.details?.reason || 'operation_failed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }).catch(() => {});
    throw error;
  }
}

async function bulkUpdateModerationCases({ admin, auth, data, mediaBucket }) {
  const operation = cleanEnum(data?.operation, BULK_OPERATIONS, 'operation');
  await prepareAdmin(admin, auth, { recent: operation === 'dismiss' });
  const cases = Array.isArray(data?.cases) ? data.cases : [];
  if (!cases.length || cases.length > MAX_BULK_CASES) {
    fail('invalid-argument', 'Bulk moderation requires 1-25 cases.', 'invalid_input');
  }
  const results = [];
  for (const item of cases) {
    try {
      const caseId = cleanText(item?.caseId, 'caseId', 180);
      const revision = expectedRevision(item?.expectedRevision);
      if (operation === 'dismiss') {
        const result = await resolveModerationCase({
          admin,
          auth,
          data: {
            caseId,
            expectedRevision: revision,
            contentAction: 'dismiss',
            accountAction: { type: 'none' },
            reasonCode: 'no_violation',
            internalNote: cleanOptionalText(data?.note, 1000),
          },
          mediaBucket,
        });
        results.push({ caseId, success: true, result });
      } else {
        const result = await updateModerationCase({
          admin,
          auth,
          data: {
            caseId,
            expectedRevision: revision,
            operation,
            ...(operation === 'set_priority' ? { priority: data?.priority } : {}),
          },
        });
        results.push({ caseId, success: true, result });
      }
    } catch (error) {
      results.push({
        caseId: cleanOptionalText(item?.caseId, 180),
        success: false,
        reason: error?.details?.reason || 'operation_failed',
      });
    }
  }
  return { operation, results };
}

async function resolveUser(admin, data) {
  const identifier = cleanText(data?.identifier, 'identifier', 320);
  try {
    return identifier.includes('@')
      ? await admin.auth().getUserByEmail(identifier.toLowerCase())
      : await admin.auth().getUser(identifier);
  } catch {
    fail('not-found', 'User was not found.', 'user_missing');
  }
}

function publicAdminUser(user) {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    admin: user.customClaims?.admin === true,
    providers: (user.providerData || []).map((provider) => provider.providerId),
    createdAt: user.metadata?.creationTime || null,
    lastSignInAt: user.metadata?.lastSignInTime || null,
  };
}

async function listAdminUsers({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listAdminUsers');
  if (data?.query) {
    const identifier = cleanText(data.query, 'query', 320);
    if (identifier.includes('@')) {
      const user = await resolveUser(admin, { identifier });
      return { items: [publicAdminUser(user)], nextCursor: null };
    }
    if (!/\s/u.test(identifier) && identifier.length <= 128) {
      try {
        const user = await admin.auth().getUser(identifier);
        return { items: [publicAdminUser(user)], nextCursor: null };
      } catch (error) {
        if (!['auth/user-not-found', 'auth/invalid-uid'].includes(error?.code)) throw error;
      }
    }
    const profiles = await admin.firestore().collection('users')
      .where('displayName', '==', identifier)
      .limit(PAGE_SIZE)
      .get();
    if (profiles.empty) fail('not-found', 'User was not found.', 'user_missing');
    const result = await admin.auth().getUsers(profiles.docs.map((entry) => ({ uid: entry.id })));
    return { items: result.users.map(publicAdminUser), nextCursor: null };
  }
  const result = await admin.auth().listUsers(PAGE_SIZE, data?.cursor || undefined);
  return { items: result.users.map(publicAdminUser), nextCursor: result.pageToken || null };
}

async function getAdminUser({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'getAdminUser');
  const user = await resolveUser(admin, data);
  const profile = await admin.firestore().doc(`users/${user.uid}`).get();
  return serialize({ ...publicAdminUser(user), profile: profile.exists ? profile.data() : null });
}

async function hideUserContent({ admin, uid, mediaBucket }) {
  const db = admin.firestore();
  let hidden = 0;
  for (const collectionName of ['recommendations', 'routes', 'trips']) {
    const snapshot = await db.collection(collectionName).where('ownerId', '==', uid).get();
    for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
      const batch = db.batch();
      snapshot.docs.slice(offset, offset + 400).forEach((entry) => {
        if (entry.data()?.status !== 'deleting') {
          batch.update(entry.ref, { status: 'suspended', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          hidden += 1;
        }
      });
      await batch.commit();
      await Promise.all(snapshot.docs.slice(offset, offset + 400).map((entry) => (
        setMediaAvailability({
          admin,
          data: entry.data(),
          mediaBucket,
          available: false,
          reason: 'owner_suspended',
        })
      )));
    }
  }
  const comments = await db.collectionGroup('comments').where('authorId', '==', uid).get();
  const affectedParents = new Map();
  const affectedRoots = new Map();
  comments.docs.forEach((entry) => {
    const parent = entry.ref.parent.parent;
    if (parent) {
      affectedParents.set(parent.path, parent);
      if (entry.data()?.threadType === 'reply' && entry.data()?.threadRootId) {
        const root = parent.collection('comments').doc(entry.data().threadRootId);
        affectedRoots.set(root.path, root);
      }
    }
  });
  for (let offset = 0; offset < comments.docs.length; offset += 400) {
    const batch = db.batch();
    comments.docs.slice(offset, offset + 400).forEach((entry) => {
      batch.update(entry.ref, { status: 'suspended', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      hidden += 1;
    });
    await batch.commit();
  }
  for (const parent of affectedParents.values()) {
    const activeComments = await parent.collection('comments').where('status', '==', 'active').count().get();
    await parent.update({
      'stats.commentCount': activeComments.data().count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
  for (const root of affectedRoots.values()) {
    const activeReplies = await root.parent
      .where('status', '==', 'active')
      .where('threadType', '==', 'reply')
      .where('threadRootId', '==', root.id)
      .count()
      .get();
    await root.update({
      replyCount: activeReplies.data().count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
  const likes = await db.collectionGroup('likes').where('userId', '==', uid).get();
  for (let offset = 0; offset < likes.docs.length; offset += 10) {
    await Promise.all(likes.docs.slice(offset, offset + 10).map((entry) => (
      detachGroupedLikeContribution({ admin, likeRef: entry.ref, deleteLike: false })
    )));
  }
  await purgeNotificationsForActor({ admin, actorId: uid });
  await db.doc(`publicProfiles/${uid}`).set({ status: 'suspended' }, { merge: true });
  return hidden;
}

async function sendModerationNotification({ admin, uid, subtype, message }) {
  const db = admin.firestore();
  const targetPath = `publicProfiles/${uid}`;
  const ref = db.doc(`users/${uid}/notifications/${systemNotificationId(subtype, targetPath)}`);
  return db.runTransaction(async (transaction) => {
    const [userSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(db.doc(`users/${uid}`)),
      transaction.get(ref),
    ]);
    if (!notificationRecipientEligible(userSnapshot)) return false;
    stageNotificationActivity({
      transaction,
      admin,
      db,
      uid,
      notificationRef: ref,
      existingSnapshot,
      notification: {
        channel: 'personal',
        type: 'system',
        subtype,
        priority: 'normal',
        count: 1,
        target: { type: 'profile', id: uid, path: targetPath, title: 'החשבון שלך' },
        navigation: { action: 'open_profile', profileId: uid },
        message,
      },
    });
    return true;
  });
}

async function warnUser({ admin, auth, uid, sourceCaseId, reasonCode, userMessage, internalNote }) {
  const user = await admin.auth().getUser(uid).catch(() => null);
  if (!user) fail('not-found', 'User was not found.', 'user_missing');
  if (user.customClaims?.admin === true) {
    fail('failed-precondition', 'Remove admin access before moderation enforcement.', 'admin_account_protected');
  }
  const id = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  await admin.firestore().doc(`system/moderation/enforcements/${id}`).create({
    type: 'warning',
    status: 'complete',
    userUid: uid,
    sourceCaseId,
    reasonCode,
    userMessage,
    internalNote,
    actorUid: auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await sendModerationNotification({ admin, uid, subtype: 'moderation_warning', message: userMessage });
  await audit({
    admin,
    auth,
    action: 'user_warned',
    target: { uid, caseId: sourceCaseId },
    reason: reasonCode,
    metadata: { enforcementId: id },
  });
  return { id, enforcementId: id, type: 'warning', status: 'complete' };
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function acquireModerationTransition({
  admin,
  uid,
  operation,
  expectedEnforcementId = null,
  requireSuspended = false,
  requireExpired = false,
  allowMissingUser = false,
  now = Date.now(),
}) {
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const transitionId = crypto.randomBytes(16).toString('base64url');
  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists && !allowMissingUser) {
      return { acquired: false, reason: 'user_missing' };
    }
    const userData = userSnapshot.exists ? userSnapshot.data() || {} : {};
    const moderation = userData.moderation || {};
    if (userData.status === 'deleting' || moderation.status === 'deleting') {
      return { acquired: false, reason: 'user_deleting' };
    }
    const currentLease = moderation.operationLease;
    if (
      currentLease?.id
      && now - Number(currentLease.startedAtMs || 0) < MODERATION_TRANSITION_TTL_MS
    ) {
      return { acquired: false, reason: 'operation_in_progress', retry: true };
    }
    if (requireSuspended && moderation.status !== 'suspended') {
      return { acquired: false, reason: 'not_suspended' };
    }
    if (expectedEnforcementId && moderation.enforcementId !== expectedEnforcementId) {
      return { acquired: false, reason: 'enforcement_superseded' };
    }

    const enforcementId = expectedEnforcementId || moderation.enforcementId || null;
    const enforcementRef = enforcementId
      ? db.doc(`system/moderation/enforcements/${enforcementId}`)
      : null;
    const enforcementSnapshot = enforcementRef ? await transaction.get(enforcementRef) : null;
    const enforcement = enforcementSnapshot?.exists ? enforcementSnapshot.data() || {} : null;
    if (expectedEnforcementId && (!enforcement || enforcement.status !== 'active')) {
      return { acquired: false, reason: 'enforcement_superseded' };
    }
    if (
      enforcement?.transitionId
      && now - Number(enforcement.transitionStartedAtMs || 0) < MODERATION_TRANSITION_TTL_MS
    ) {
      return { acquired: false, reason: 'operation_in_progress', retry: true };
    }
    if (
      requireExpired
      && (
        enforcement?.permanent === true
        || !timestampMillis(enforcement?.endsAt)
        || timestampMillis(enforcement.endsAt) > now
      )
    ) {
      return { acquired: false, reason: 'enforcement_not_expired', retry: true };
    }

    const operationLease = { id: transitionId, operation, startedAtMs: now };
    if (userSnapshot.exists) {
      transaction.update(userRef, { 'moderation.operationLease': operationLease });
    } else {
      transaction.set(userRef, { moderation: { operationLease } }, { merge: true });
    }
    if (enforcementRef && enforcement) {
      transaction.set(enforcementRef, {
        transitionId,
        transitionStatus: operation,
        transitionStartedAtMs: now,
      }, { merge: true });
    }
    return {
      acquired: true,
      id: transitionId,
      uid,
      operation,
      userData,
      userRef,
      enforcementId,
      enforcementRef: enforcementRef && enforcement ? enforcementRef : null,
    };
  });
}

async function releaseModerationTransition({ admin, transition }) {
  if (!transition?.acquired) return false;
  const db = admin.firestore();
  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(transition.userRef);
    const enforcementSnapshot = transition.enforcementRef
      ? await transaction.get(transition.enforcementRef)
      : null;
    let released = false;
    if (userSnapshot.exists && userSnapshot.data()?.moderation?.operationLease?.id === transition.id) {
      transaction.update(transition.userRef, {
        'moderation.operationLease': admin.firestore.FieldValue.delete(),
      });
      released = true;
    }
    if (enforcementSnapshot?.exists && enforcementSnapshot.data()?.transitionId === transition.id) {
      transaction.update(transition.enforcementRef, {
        transitionId: admin.firestore.FieldValue.delete(),
        transitionStatus: admin.firestore.FieldValue.delete(),
        transitionStartedAtMs: admin.firestore.FieldValue.delete(),
      });
    }
    return released;
  });
}

async function finalizeReinstatement({ admin, transition, actorUid, reason }) {
  const completionStatus = actorUid === 'system' ? 'complete' : 'revoked';
  const db = admin.firestore();
  const publicRef = db.doc(`publicProfiles/${transition.uid}`);
  const notificationMessage = 'ההשעיה הסתיימה והחשבון שלך חזר לפעילות. תוכן שהוסר בעבר לא פורסם מחדש.';
  const notificationRef = db.doc(
    `users/${transition.uid}/notifications/${systemNotificationId('account_reinstated', publicRef.path)}`
  );
  return db.runTransaction(async (transaction) => {
    const [userSnapshot, enforcementSnapshot, notificationSnapshot] = await Promise.all([
      transaction.get(transition.userRef),
      transition.enforcementRef ? transaction.get(transition.enforcementRef) : null,
      transaction.get(notificationRef),
    ]);
    const current = userSnapshot.exists ? userSnapshot.data() || {} : {};
    if (
      !userSnapshot.exists
      || current.moderation?.operationLease?.id !== transition.id
      || current.moderation?.status !== 'suspended'
      || (transition.enforcementId && current.moderation?.enforcementId !== transition.enforcementId)
    ) return false;
    if (
      transition.enforcementRef
      && (
        !enforcementSnapshot?.exists
        || enforcementSnapshot.data()?.status !== 'active'
        || enforcementSnapshot.data()?.transitionId !== transition.id
      )
    ) return false;

    const activeModeration = {
      ...(current.moderation || {}),
      status: 'active',
      reason,
      actorUid,
    };
    const activeUser = { ...current, moderation: activeModeration };
    transaction.update(transition.userRef, {
      'moderation.status': 'active',
      'moderation.reason': reason,
      'moderation.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      'moderation.actorUid': actorUid,
      'moderation.suspensionEndsAt': admin.firestore.FieldValue.delete(),
      'moderation.enforcementId': admin.firestore.FieldValue.delete(),
      'moderation.permanent': admin.firestore.FieldValue.delete(),
    });
    if (transition.enforcementRef) {
      transaction.update(transition.enforcementRef, {
        status: completionStatus,
        ...(completionStatus === 'complete'
          ? { completedAt: admin.firestore.FieldValue.serverTimestamp() }
          : {
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            revokedBy: actorUid,
          }),
        transitionId: admin.firestore.FieldValue.delete(),
        transitionStatus: admin.firestore.FieldValue.delete(),
        transitionStartedAtMs: admin.firestore.FieldValue.delete(),
      });
    }
    if (isPublicProfileEligible(activeUser)) {
      transaction.set(publicRef, {
        ...sanitizePublicProfile(transition.uid, activeUser),
        status: 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: false });
    } else {
      transaction.delete(publicRef);
    }
    stageNotificationActivity({
      transaction,
      admin,
      db,
      uid: transition.uid,
      notificationRef,
      existingSnapshot: notificationSnapshot,
      notification: {
        channel: 'personal',
        type: 'system',
        subtype: 'account_reinstated',
        priority: 'normal',
        count: 1,
        target: { type: 'profile', id: transition.uid, path: publicRef.path, title: 'החשבון שלך' },
        navigation: { action: 'open_profile', profileId: transition.uid },
        message: notificationMessage,
      },
    });
    return true;
  });
}

async function reinstateUserAccount({
  admin,
  uid,
  mediaBucket,
  actorUid = 'system',
  reason = 'suspension_expired',
  expectedEnforcementId = null,
  requireExpired = false,
  now = Date.now(),
  acquireModerationTransitionImpl = acquireModerationTransition,
  releaseModerationTransitionImpl = releaseModerationTransition,
  setMediaAvailabilityImpl = setMediaAvailability,
  finalizeReinstatementImpl = finalizeReinstatement,
}) {
  const transition = await acquireModerationTransitionImpl({
    admin,
    uid,
    operation: 'reinstate',
    expectedEnforcementId,
    requireSuspended: true,
    requireExpired,
    now,
  });
  if (!transition.acquired) return { uid, reinstated: false, ...transition };
  let authEnabled = false;
  let mediaRestored = false;
  let stateFinalized = false;
  try {
    await admin.auth().updateUser(uid, { disabled: false });
    authEnabled = true;
    await admin.auth().revokeRefreshTokens(uid);
    await setMediaAvailabilityImpl({
      admin,
      data: transition.userData,
      mediaBucket,
      available: true,
      reason: null,
    });
    mediaRestored = true;
    stateFinalized = await finalizeReinstatementImpl({ admin, transition, actorUid, reason });
    if (!stateFinalized) {
      await admin.auth().updateUser(uid, { disabled: true });
      await admin.auth().revokeRefreshTokens(uid);
      await setMediaAvailabilityImpl({
        admin,
        data: transition.userData,
        mediaBucket,
        available: false,
        reason: 'owner_suspended',
      }).catch(() => {});
      return { uid, reinstated: false, reason: 'enforcement_superseded' };
    }
    return { uid, reinstated: true, enforcementId: transition.enforcementId };
  } catch (error) {
    if (authEnabled && !stateFinalized) {
      await admin.auth().updateUser(uid, { disabled: true }).catch(() => {});
      await admin.auth().revokeRefreshTokens(uid).catch(() => {});
      if (mediaRestored) {
        await setMediaAvailabilityImpl({
          admin,
          data: transition.userData,
          mediaBucket,
          available: false,
          reason: 'owner_suspended',
        }).catch(() => {});
      }
    }
    throw error;
  } finally {
    await releaseModerationTransitionImpl({ admin, transition }).catch(() => {});
  }
}

async function setUserSuspension({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'setUserSuspension');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'You cannot suspend yourself.', 'self_admin_action');
  const suspended = data?.suspended === true;
  const reason = cleanText(data?.reason, 'reason');
  if (suspended && user.customClaims?.admin === true) {
    fail('failed-precondition', 'Remove admin access before moderation enforcement.', 'admin_account_protected');
  }
  const durationHours = data?.durationHours == null
    ? null
    : Number(data.durationHours);
  if (suspended && durationHours != null && !SUSPENSION_HOURS.includes(durationHours)) {
    fail('invalid-argument', 'Suspension duration is invalid.', 'invalid_input');
  }
  if (!suspended) {
    const result = await reinstateUserAccount({
      admin,
      uid: user.uid,
      mediaBucket,
      actorUid: auth.uid,
      reason,
    });
    if (!result.reinstated) {
      const retryable = result.retry === true || result.reason === 'enforcement_superseded';
      fail(
        retryable ? 'aborted' : 'failed-precondition',
        retryable ? 'The account enforcement changed.' : 'The account is not currently suspended.',
        retryable ? 'account_enforcement_conflict' : result.reason || 'invalid_account_state'
      );
    }
    await audit({ admin, auth, action: 'user_unsuspended', target: { uid: user.uid }, reason });
    return { uid: user.uid, suspended: false, hidden: 0, ...result };
  }
  const transition = await acquireModerationTransition({
    admin,
    uid: user.uid,
    operation: 'suspend',
    allowMissingUser: true,
  });
  if (!transition.acquired) {
    fail('aborted', 'The account enforcement changed.', 'account_enforcement_conflict');
  }
  try {
    const enforcementId = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const endsAt = durationHours == null
      ? null
      : admin.firestore.Timestamp.fromMillis(Date.now() + durationHours * 60 * 60 * 1000);
    await admin.auth().updateUser(user.uid, { disabled: true });
    await admin.auth().revokeRefreshTokens(user.uid);
    const userRef = admin.firestore().doc(`users/${user.uid}`);
    await userRef.update({
      'moderation.status': 'suspended',
      'moderation.reason': reason,
      'moderation.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
      'moderation.actorUid': auth.uid,
      'moderation.enforcementId': enforcementId,
      'moderation.permanent': endsAt == null,
      'moderation.suspensionEndsAt': endsAt || admin.firestore.FieldValue.delete(),
    });
    const privateProfile = await userRef.get();
    if (privateProfile.exists) {
      await setMediaAvailability({
        admin,
        data: privateProfile.data(),
        mediaBucket,
        available: false,
        reason: 'owner_suspended',
      });
    }
    const hidden = await hideUserContent({ admin, uid: user.uid, mediaBucket });
    await admin.firestore().doc(`publicProfiles/${user.uid}`).delete().catch(() => {});
    const reasonCode = cleanOptionalText(data?.reasonCode, 80) || 'other';
    const userMessage = cleanOptionalText(data?.userMessage, 240)
      || policyReason(reasonCode)?.userMessage
      || 'החשבון שלך הושעה בעקבות הפרה של כללי הקהילה.';
    await admin.firestore().doc(`system/moderation/enforcements/${enforcementId}`).create({
      type: 'suspension',
      status: 'active',
      userUid: user.uid,
      sourceCaseId: cleanOptionalText(data?.sourceCaseId, 180),
      reasonCode,
      userMessage,
      internalNote: cleanOptionalText(data?.internalNote, 1000),
      durationHours,
      permanent: endsAt == null,
      ...(endsAt ? { endsAt } : {}),
      actorUid: auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await sendModerationNotification({ admin, uid: user.uid, subtype: 'account_suspended', message: userMessage });
    await audit({ admin, auth, action: 'user_suspended', target: { uid: user.uid }, reason, metadata: { hidden, enforcementId, durationHours } });
    return { uid: user.uid, suspended: true, hidden, enforcementId, endsAt: serialize(endsAt) };
  } finally {
    await releaseModerationTransition({ admin, transition }).catch(() => {});
  }
}

async function processExpiredModerationSuspensions({
  admin,
  mediaBucket,
  limit = 100,
  now = Date.now(),
  reinstateImpl = reinstateUserAccount,
  auditImpl = audit,
}) {
  const db = admin.firestore();
  const snapshot = await db.collection('system/moderation/enforcements')
    .where('type', '==', 'suspension')
    .where('status', '==', 'active')
    .where('endsAt', '<=', admin.firestore.Timestamp.fromMillis(now))
    .orderBy('endsAt', 'asc')
    .limit(Math.max(1, Math.min(200, Math.trunc(Number(limit) || 100))))
    .get();
  let reinstated = 0;
  let superseded = 0;
  for (const entry of snapshot.docs) {
    const enforcement = entry.data() || {};
    const userSnapshot = await db.doc(`users/${enforcement.userUid}`).get();
    const current = userSnapshot.exists ? userSnapshot.data() || {} : {};
    if (
      current.moderation?.status !== 'suspended'
      || current.moderation?.enforcementId !== entry.id
    ) {
      await entry.ref.set({
        status: 'superseded',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      superseded += 1;
      continue;
    }
    const result = await reinstateImpl({
      admin,
      uid: enforcement.userUid,
      mediaBucket,
      reason: 'suspension_expired',
      expectedEnforcementId: entry.id,
      requireExpired: true,
      now,
    });
    if (result.retry === true) continue;
    await entry.ref.set({
      status: result.reinstated ? 'complete' : 'superseded',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (result.reinstated) {
      reinstated += 1;
      await auditImpl({
        admin,
        auth: { uid: 'system', token: { name: 'מערכת' } },
        action: 'user_suspension_expired',
        target: { uid: enforcement.userUid },
        reason: 'suspension_expired',
        metadata: { enforcementId: entry.id },
      });
    } else superseded += 1;
  }
  return { scanned: snapshot.size, reinstated, superseded };
}

async function setUserEmailVerified({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'setUserEmailVerified');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'You cannot modify your own verification.', 'self_admin_action');
  const verified = data?.verified === true;
  const reason = cleanText(data?.reason, 'reason');
  await admin.auth().updateUser(user.uid, { emailVerified: verified });
  await admin.auth().revokeRefreshTokens(user.uid);
  await audit({ admin, auth, action: verified ? 'email_verified' : 'email_unverified', target: { uid: user.uid }, reason });
  return { uid: user.uid, verified };
}

async function setUserAdmin({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'setUserAdmin');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'You cannot change your own admin access.', 'self_admin_action');
  const enabled = data?.admin === true;
  const reason = cleanText(data?.reason, 'reason');
  if (!enabled) {
    await deactivateAdminRegistry({
      admin,
      uid: user.uid,
      actorUid: auth.uid,
      requireActiveActor: true,
    });
  }
  await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: enabled });
  if (enabled) {
    try {
      await activateAdminRegistry({ admin, uid: user.uid, actorUid: auth.uid });
    } catch (error) {
      await admin.auth().setCustomUserClaims(
        user.uid,
        { ...(user.customClaims || {}), admin: false }
      ).catch(() => {});
      await admin.auth().revokeRefreshTokens(user.uid).catch(() => {});
      throw error;
    }
  }
  await admin.auth().revokeRefreshTokens(user.uid);
  const adminNotificationsPurged = enabled
    ? 0
    : await purgeAdminNotificationsForUser({ admin, uid: user.uid });
  await audit({ admin, auth, action: enabled ? 'admin_granted' : 'admin_removed', target: { uid: user.uid }, reason });
  return { uid: user.uid, admin: enabled, adminNotificationsPurged };
}

async function deleteUserAsAdmin({ admin, auth, data, mediaBucket }) {
  await prepareAdminAction(admin, auth, 'deleteUserAsAdmin');
  const user = await resolveUser(admin, data);
  if (user.uid === auth.uid) fail('failed-precondition', 'Use account settings to delete your own account.', 'self_admin_action');
  const reason = cleanText(data?.reason, 'reason');
  const db = admin.firestore();
  const deletionKey = crypto.createHash('sha256').update(`delete-user:${user.uid}`).digest('base64url');
  const jobRef = db.doc(`system/moderation/jobs/${deletionKey}`);
  await jobRef.set({ type: 'delete_user', uid: user.uid, status: 'running', step: 'content', createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  const deletion = await deleteAccountInternal({
    admin,
    uid: user.uid,
    mediaBucket,
    actorUid: auth.uid,
    requireActiveAdminActor: true,
  });
  await audit({
    admin,
    auth,
    action: 'user_deleted',
    target: { uid: 'deleted-user' },
    reason,
    metadata: {
      ownedContent: deletion.ownedContent,
      interactions: deletion.interactions,
      purgedReports: deletion.purgedReports,
    },
  });
  await jobRef.set({
    uid: admin.firestore.FieldValue.delete(),
    subjectHash: deletionKey,
    status: 'complete',
    step: 'complete',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }, { merge: true });
  return { status: 'complete' };
}

async function listModerationAudit({ admin, auth, data }) {
  await prepareAdminAction(admin, auth, 'listModerationAudit');
  let query = admin.firestore().collection('system/moderation/audit').orderBy('createdAt', 'desc').limit(PAGE_SIZE);
  if (data?.cursor) {
    const cursor = await admin.firestore().doc(`system/moderation/audit/${cleanText(data.cursor, 'cursor', 180)}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  const items = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const missingNames = Array.from(new Set(items
    .filter((item) => !item.actorName && item.actorUid)
    .map((item) => item.actorUid)));
  const actorSnapshots = missingNames.length
    ? await admin.firestore().getAll(...missingNames.map((uid) => admin.firestore().doc(`users/${uid}`)))
    : [];
  const actorNames = new Map(actorSnapshots.map((entry) => [
    entry.id,
    typeof entry.data()?.displayName === 'string' ? entry.data().displayName.trim().slice(0, 80) : '',
  ]));
  return {
    items: items.map((item) => serialize({
      ...item,
      actorName: item.actorName || actorNames.get(item.actorUid) || 'מנהל מערכת',
    })),
    nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
  };
}

module.exports = {
  audit,
  assertAdmin,
  assertRecentAuth,
  bulkUpdateModerationCases,
  deleteAdminSavedView,
  sensitiveAdminActions,
  deleteUserAsAdmin,
  finalizeReinstatement,
  getAdminResource,
  getAdminUser,
  getModerationCase,
  getModerationDashboard,
  getModerationPolicy,
  listAdminUsers,
  listAdminSavedViews,
  listHeldContent,
  listModerationAudit,
  listModerationCases,
  moderateContent,
  prepareAdmin,
  publicModerationCase,
  publicModerationReport,
  processExpiredModerationSuspensions,
  reinstateUserAccount,
  resolveModerationCase,
  saveAdminSavedView,
  searchAdminResources,
  setUserAdmin,
  setUserEmailVerified,
  prepareAdminAction,
  setUserSuspension,
  updateModerationCase,
  updateAdminAttachedPlace,
};
