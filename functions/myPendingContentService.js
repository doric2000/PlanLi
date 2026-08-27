const { HttpsError } = require('firebase-functions/v2/https');

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const CONTENT_TYPES = Object.freeze([
  { type: 'recommendation', collection: 'recommendations' },
  { type: 'route', collection: 'routes' },
]);

function fail(message) {
  throw new HttpsError('invalid-argument', message, { reason: 'invalid_cursor' });
}

function cleanPageSize(value) {
  if (value == null) return DEFAULT_PAGE_SIZE;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    fail('limit is invalid.');
  }
  return parsed;
}

function cleanCursorId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) return null;
  if (id.length > 180 || id.includes('/')) fail('cursor is invalid.');
  return id;
}

function cleanCursor(value) {
  if (value == null) return { recommendationId: null, routeId: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('cursor is invalid.');
  return {
    recommendationId: cleanCursorId(value.recommendationId),
    routeId: cleanCursorId(value.routeId),
  };
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function safeText(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function safeThumbUrl(data) {
  const url = Array.isArray(data?.media) ? data.media[0]?.thumb?.url : null;
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url.slice(0, 2000) : null;
}

function pendingItem(type, entry) {
  const data = entry.data() || {};
  const submittedAtMs = timestampMillis(data.createdAt || data.updatedAt);
  return {
    id: entry.id,
    contentType: type,
    title: safeText(data.title || data.Title, 180) || (type === 'route' ? 'מסלול' : 'המלצה'),
    thumbnailUrl: safeThumbUrl(data),
    publicationStatus: 'moderation_hold',
    submittedAtMs,
  };
}

async function loadCursorSnapshot({ db, collection, cursorId, uid }) {
  if (!cursorId) return null;
  const snapshot = await db.collection(collection).doc(cursorId).get();
  if (!snapshot.exists
    || snapshot.data()?.ownerId !== uid
    || snapshot.data()?.status !== 'moderation_hold') {
    fail('cursor is invalid.');
  }
  return snapshot;
}

async function loadTypePage({ db, type, collection, uid, cursorId, pageSize }) {
  const cursorSnapshot = await loadCursorSnapshot({ db, collection, cursorId, uid });
  let query = db.collection(collection)
    .where('ownerId', '==', uid)
    .where('status', '==', 'moderation_hold')
    .orderBy('createdAt', 'desc')
    .limit(pageSize + 1);
  if (cursorSnapshot) query = query.startAfter(cursorSnapshot);
  const snapshot = await query.get();
  return snapshot.docs.map((entry) => ({ type, entry, item: pendingItem(type, entry) }));
}

async function listMyPendingContent({ admin, auth, data = {} }) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const pageSize = cleanPageSize(data?.limit);
  const cursor = cleanCursor(data?.cursor);
  const db = admin.firestore();
  const groups = await Promise.all(CONTENT_TYPES.map(({ type, collection }) => loadTypePage({
    db,
    type,
    collection,
    uid: auth.uid,
    cursorId: cursor[`${type}Id`],
    pageSize,
  })));
  const sorted = groups.flat().sort((left, right) => (
    right.item.submittedAtMs - left.item.submittedAtMs
      || right.entry.id.localeCompare(left.entry.id)
  ));
  const selected = sorted.slice(0, pageSize);
  const next = { ...cursor };
  selected.forEach(({ type, entry }) => { next[`${type}Id`] = entry.id; });
  const hasMore = sorted.length > selected.length
    || groups.some((group) => group.length > pageSize);
  return {
    items: selected.map(({ item }) => item),
    nextCursor: hasMore ? next : null,
  };
}

module.exports = {
  cleanCursor,
  cleanPageSize,
  listMyPendingContent,
  pendingItem,
};
