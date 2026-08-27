const crypto = require('crypto');
const { buildSearchIndex } = require('./discoverySearch');
const { buildModerationPreview } = require('./moderationPreview');

const ROOT_TYPES = Object.freeze({
  recommendations: 'recommendation',
  routes: 'route',
  trips: 'trip',
  publicProfiles: 'profile',
});

function projectionId(path) {
  return crypto.createHash('sha256').update(String(path || '')).digest('base64url');
}

function targetForPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (
    parts.length === 8
    && parts[0] === 'routes'
    && parts[2] === 'revisions'
    && parts[4] === 'days'
    && parts[6] === 'stops'
  ) {
    return {
      type: 'route',
      id: parts[1],
      path: `routes/${parts[1]}`,
      revisionId: parts[3],
      subject: { kind: 'attached_place', field: 'place', dayId: parts[5], stopId: parts[7] },
    };
  }
  if (parts[0] === 'countries' && parts[2] === 'destinations' && parts.length === 4) {
    return {
      type: 'destination',
      id: parts[3],
      countryId: parts[1],
      cityId: parts[3],
      path,
    };
  }
  if (parts.length === 4 && parts[2] === 'comments' && ROOT_TYPES[parts[0]]) {
    return {
      type: 'comment',
      id: parts[3],
      parentType: ROOT_TYPES[parts[0]],
      parentId: parts[1],
      path,
    };
  }
  const type = ROOT_TYPES[parts[0]];
  return type && parts.length === 2 ? { type, id: parts[1], path } : null;
}

function cleanText(value, maximum = 240) {
  return typeof value === 'string'
    ? Array.from(value.replace(/\s+/gu, ' ').trim()).slice(0, maximum).join('')
    : '';
}

function projectionTitle(target, data, parentData) {
  if (target.subject?.kind === 'attached_place') {
    return cleanText(data.title || data.place?.name || parentData?.title, 140) || 'מקום במסלול';
  }
  if (target.type === 'profile') return cleanText(data.displayName, 140) || 'פרופיל';
  if (target.type === 'comment') return cleanText(data.text, 140) || cleanText(parentData?.title, 140) || 'תגובה';
  if (target.type === 'destination') {
    return cleanText(
      data.identity?.names?.he
      || data.googleCache?.names?.he
      || data.identity?.names?.en
      || data.googleCache?.names?.en
      || target.cityId,
      140
    );
  }
  return cleanText(data.title, 140) || 'תוכן ללא כותרת';
}

function buildAdminSearchProjection({ target, data, parentData = null }) {
  if (!target || !data || typeof data !== 'object') return null;
  const title = projectionTitle(target, data, parentData);
  const targetCountryName = cleanText(data.countryName, 140);
  const ownerId = target.type === 'profile'
    ? target.id
    : cleanText(data.authorId || data.ownerId || parentData?.ownerId, 180);
  const destination = data.destination
    || (Array.isArray(data.destinations) ? data.destinations[0] : null)
    || (target.type === 'destination'
      ? {
          countryId: target.countryId,
          cityId: target.cityId,
          cityName: title,
          ...(targetCountryName ? { countryName: targetCountryName } : {}),
        }
      : null);
  const previewData = target.subject?.kind === 'attached_place'
    ? { ...(parentData || {}), place: data.place, attachedPlace: data }
    : data;
  const preview = buildModerationPreview({ target, data: previewData, parentData });
  const search = buildSearchIndex({
    title: [title, target.id, ownerId, data.authorPreview?.displayName].filter(Boolean).join(' '),
    description: target.type === 'comment' ? data.text : data.description || data.bio,
    destination,
    destinations: data.destinations,
    place: data.place,
  });
  return {
    schemaVersion: 1,
    target,
    type: target.type,
    sourcePath: target.path,
    title,
    subtitle: cleanText(
      target.type === 'comment' ? parentData?.title : data.authorPreview?.displayName || destination?.cityName,
      180
    ),
    status: cleanText(data.status || parentData?.status, 40) || (target.type === 'profile' ? 'active' : 'unknown'),
    ...(ownerId ? { ownerId } : {}),
    ...(destination ? { destination } : {}),
    preview,
    search: { prefixes: search.prefixes.slice(0, 480) },
    sourceUpdatedAt: data.updatedAt || data.createdAt || null,
  };
}

async function handleAdminSearchProjectionWrite({ admin, event }) {
  const after = event?.data?.after;
  const sourcePath = after?.ref?.path || event?.data?.before?.ref?.path || '';
  const target = targetForPath(sourcePath);
  if (!target) return { status: 'ignored', reason: 'unsupported_path' };
  const ref = admin.firestore().doc(`system/moderation/search/${projectionId(sourcePath)}`);
  if (!after?.exists) {
    await ref.delete().catch((error) => {
      if (error?.code !== 5 && error?.code !== 404) throw error;
    });
    if (target.type === 'route' && !target.subject) {
      await removeInactiveRouteStopProjections({ admin, routeId: target.id, activeRevisionId: null });
    }
    return { status: 'deleted' };
  }
  const data = after.data() || {};
  const parentSnapshot = target.type === 'comment' || target.subject?.kind === 'attached_place'
    ? await admin.firestore().doc(`${sourcePath.split('/').slice(0, 2).join('/')}`).get()
    : null;
  const parentData = parentSnapshot?.exists ? parentSnapshot.data() || {} : null;
  if (target.subject?.kind === 'attached_place' && parentData?.activeRevisionId !== target.revisionId) {
    await ref.delete().catch(() => {});
    return { status: 'deleted', reason: 'inactive_route_revision' };
  }
  const projection = buildAdminSearchProjection({ target, data, parentData });
  await ref.set({
    ...projection,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: false });
  if (target.type === 'route' && !target.subject) {
    await removeInactiveRouteStopProjections({
      admin,
      routeId: target.id,
      activeRevisionId: cleanText(data.activeRevisionId, 180) || null,
    });
  }
  return { status: 'updated', projectionId: ref.id };
}

async function removeInactiveRouteStopProjections({ admin, routeId, activeRevisionId }) {
  const db = admin.firestore();
  const snapshot = await db.collection('system/moderation/search')
    .where('type', '==', 'route')
    .where('target.id', '==', routeId)
    .get();
  const stale = snapshot.docs.filter((entry) => {
    const target = entry.data()?.target;
    return target?.subject?.kind === 'attached_place'
      && (!activeRevisionId || target.revisionId !== activeRevisionId);
  });
  for (let offset = 0; offset < stale.length; offset += 400) {
    const batch = db.batch();
    stale.slice(offset, offset + 400).forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
  return stale.length;
}

module.exports = {
  buildAdminSearchProjection,
  handleAdminSearchProjectionWrite,
  projectionId,
  removeInactiveRouteStopProjections,
  targetForPath,
};
