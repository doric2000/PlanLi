const POST_COLLECTIONS = Object.freeze({
  recommendation: 'recommendations',
  route: 'routes',
  trip: 'trips',
});

const MAX_TITLE_LENGTH = 180;
const MAX_TEXT_LENGTH = 5000;
const MAX_URL_LENGTH = 2000;

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, compact(entry)]));
}

function cleanText(value, maximum) {
  if (typeof value !== 'string') return '';
  return Array.from(value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim())
    .slice(0, maximum)
    .join('');
}

function safeUrl(value) {
  const result = typeof value === 'string' ? value.trim() : '';
  return result.length <= MAX_URL_LENGTH && /^https:\/\//i.test(result) ? result : null;
}

function cleanId(value) {
  const result = typeof value === 'string' ? value.trim() : '';
  return result && result.length <= 180 && !result.includes('/') ? result : null;
}

function canonicalTargetPath(target) {
  const type = String(target?.type || '').trim().toLowerCase();
  const id = cleanId(target?.id);
  if (!id) return null;
  if (type === 'profile') return `publicProfiles/${id}`;
  if (type === 'comment') {
    const parentType = String(target?.parentType || '').trim().toLowerCase();
    const parentId = cleanId(target?.parentId);
    if (!POST_COLLECTIONS[parentType] || !parentId) return null;
    return `${POST_COLLECTIONS[parentType]}/${parentId}/comments/${id}`;
  }
  return POST_COLLECTIONS[type] ? `${POST_COLLECTIONS[type]}/${id}` : null;
}

function parentTargetPath(target) {
  if (target?.type !== 'comment') return null;
  const parentType = String(target?.parentType || '').trim().toLowerCase();
  const parentId = cleanId(target?.parentId);
  return POST_COLLECTIONS[parentType] && parentId
    ? `${POST_COLLECTIONS[parentType]}/${parentId}`
    : null;
}

function mediaEntries(data) {
  if (Array.isArray(data?.media)) return data.media.filter(Boolean);
  return data?.media && typeof data.media === 'object' ? [data.media] : [];
}

function mediaUrl(data) {
  const first = mediaEntries(data)[0];
  return safeUrl(first?.feed?.url)
    || safeUrl(first?.thumb?.url)
    || safeUrl(first?.large?.url)
    || safeUrl(data?.destinationImage?.urls?.feed)
    || safeUrl(data?.destinationImage?.urls?.thumb)
    || safeUrl(data?.photoMedia?.feed?.url)
    || safeUrl(data?.photoMedia?.thumb?.url)
    || safeUrl(data?.externalImageUrl)
    || safeUrl(data?.imageUrl)
    || safeUrl(data?.photoURL);
}

function previewDestination(data) {
  const destination = data?.destination || (Array.isArray(data?.destinations) ? data.destinations[0] : null);
  if (!destination || typeof destination !== 'object') return null;
  const cityName = cleanText(destination.cityName, 120);
  const countryName = cleanText(destination.countryName, 120);
  if (!cityName && !countryName) return null;
  return compact({ cityName: cityName || undefined, countryName: countryName || undefined });
}

function previewAuthor(target, data, ownerProfile) {
  const uid = target?.type === 'profile'
    ? cleanId(target?.id)
    : cleanId(data?.authorId || data?.ownerId);
  const embedded = data?.authorPreview && typeof data.authorPreview === 'object'
    ? data.authorPreview
    : {};
  const displayName = cleanText(
    ownerProfile?.displayName || embedded.displayName || (target?.type === 'profile' ? data?.displayName : ''),
    80
  );
  const photoURL = safeUrl(
    ownerProfile?.photoMedia?.thumb?.url
      || ownerProfile?.photoURL
      || embedded.photoURL
      || (target?.type === 'profile' ? mediaUrl(data) : null)
  );
  if (!uid && !displayName && !photoURL) return null;
  return compact({
    uid: uid || undefined,
    displayName: displayName || 'Traveler',
    photoURL: photoURL || undefined,
  });
}

function buildModerationPreview({ target, data, parentData = null, ownerProfile = null }) {
  const type = String(target?.type || '').trim().toLowerCase();
  const id = cleanId(target?.id);
  if (!data || typeof data !== 'object') {
    return compact({ available: false, type, id: id || undefined, status: 'missing' });
  }

  const isComment = type === 'comment';
  const isProfile = type === 'profile';
  const parentTitle = cleanText(parentData?.title, MAX_TITLE_LENGTH);
  const title = cleanText(
    isProfile
      ? data.displayName
      : isComment
        ? parentTitle
        : data.title,
    MAX_TITLE_LENGTH
  );
  const text = cleanText(
    isProfile ? data.bio : isComment ? data.text : data.description,
    MAX_TEXT_LENGTH
  );
  const sourceForImage = isComment && parentData ? parentData : data;
  const parent = isComment
    ? compact({
        type: target.parentType,
        id: target.parentId,
        title: parentTitle || undefined,
      })
    : null;

  return compact({
    available: true,
    type,
    id: id || undefined,
    status: cleanText(data.status, 40) || (isProfile ? 'active' : undefined),
    title: title || (isComment ? 'תגובה' : isProfile ? 'פרופיל' : 'תוכן ללא כותרת'),
    text,
    imageUrl: mediaUrl(sourceForImage) || undefined,
    mediaCount: mediaEntries(sourceForImage).length,
    author: previewAuthor(target, data, ownerProfile),
    destination: previewDestination(isComment ? parentData : data),
    parent,
  });
}

function preserveReportedPreview(existing, current) {
  return existing && typeof existing === 'object' ? existing : current;
}

async function hydrateModerationPreviews(admin, items) {
  const db = admin.firestore();
  const missing = items.filter((item) => !item?.targetPreview || typeof item.targetPreview !== 'object');
  const targetPaths = Array.from(new Set(items.map((item) => canonicalTargetPath(item.target)).filter(Boolean)));
  const parentPaths = Array.from(new Set(missing.map((item) => parentTargetPath(item.target)).filter(Boolean)));
  const allContentPaths = Array.from(new Set([...targetPaths, ...parentPaths]));
  const contentSnapshots = allContentPaths.length
    ? await db.getAll(...allContentPaths.map((path) => db.doc(path)))
    : [];
  const contentByPath = new Map(contentSnapshots.map((snapshot) => [snapshot.ref.path, snapshot]));

  const ownerIds = Array.from(new Set(missing.map((item) => {
    const path = canonicalTargetPath(item.target);
    const snapshot = path ? contentByPath.get(path) : null;
    const data = snapshot?.exists ? snapshot.data() : null;
    return cleanId(item.target?.type === 'profile' ? item.target?.id : data?.authorId || data?.ownerId);
  }).filter(Boolean)));
  const profileSnapshots = ownerIds.length
    ? await db.getAll(...ownerIds.map((uid) => db.doc(`publicProfiles/${uid}`)))
    : [];
  const profilesByUid = new Map(profileSnapshots.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data() : null]));

  return items.map((item) => {
    const path = canonicalTargetPath(item.target);
    const targetSnapshot = path ? contentByPath.get(path) : null;
    const targetData = targetSnapshot?.exists ? targetSnapshot.data() : null;
    if (item?.targetPreview && typeof item.targetPreview === 'object') {
      return {
        ...item,
        targetPreview: {
          ...item.targetPreview,
          available: Boolean(targetSnapshot?.exists),
          ...(targetData?.status ? { status: cleanText(targetData.status, 40) } : {}),
        },
      };
    }
    const parentPath = parentTargetPath(item.target);
    const parentSnapshot = parentPath ? contentByPath.get(parentPath) : null;
    const parentData = parentSnapshot?.exists ? parentSnapshot.data() : null;
    const ownerId = cleanId(item.target?.type === 'profile'
      ? item.target?.id
      : targetData?.authorId || targetData?.ownerId);
    return {
      ...item,
      targetPreview: buildModerationPreview({
        target: item.target,
        data: targetData,
        parentData,
        ownerProfile: ownerId ? profilesByUid.get(ownerId) : null,
      }),
    };
  });
}

module.exports = {
  MAX_TEXT_LENGTH,
  buildModerationPreview,
  canonicalTargetPath,
  hydrateModerationPreviews,
  preserveReportedPreview,
};
