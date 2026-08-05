const { INTEREST_IDS, VIBE_IDS } = require('./travelTaxonomy');

const PUBLIC_SMART_PROFILE_FIELDS = [
  'interests',
  'vibe',
];

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function sanitizePublicBio(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .slice(0, 2)
    .map((line) => line.trim())
    .join('\n')
    .trim();
  if (!normalized) return undefined;
  return Array.from(normalized).slice(0, 160).join('');
}

function sanitizePublicSmartProfile(smartProfile) {
  if (!smartProfile || typeof smartProfile !== 'object') return null;

  const result = {};
  const specifications = {
    interests: { allowed: INTEREST_IDS, maximum: 8 },
    vibe: { allowed: VIBE_IDS, maximum: 3 },
  };
  for (const key of PUBLIC_SMART_PROFILE_FIELDS) {
    const value = smartProfile[key];
    if (Array.isArray(value)) {
      result[key] = Array.from(new Set(value
        .filter((entry) => specifications[key].allowed.includes(entry))))
        .slice(0, specifications[key].maximum);
    }
  }

  return Object.keys(result).length ? result : null;
}

function sanitizePublicProfile(userId, data = {}) {
  return compactObject({
    uid: userId,
    displayName:
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName.trim().slice(0, 80)
        : 'Traveler',
    photoURL:
      typeof data.photoURL === 'string' && data.photoURL
        ? data.photoURL
        : null,
    photoMedia:
      data.photoMedia && typeof data.photoMedia === 'object'
        ? data.photoMedia
        : null,
    bio: sanitizePublicBio(data.bio),
    isExpert: data.isExpert === true,
    smartProfile: sanitizePublicSmartProfile(data.smartProfile),
  });
}

function publicProfileProjectionChanged(userId, before, after) {
  const beforeProjection = before ? sanitizePublicProfile(userId, before) : null;
  const afterProjection = after ? sanitizePublicProfile(userId, after) : null;
  return JSON.stringify(beforeProjection) !== JSON.stringify(afterProjection);
}

async function syncPublicProfile(admin, userId, afterData) {
  const publicRef = admin.firestore().doc(`publicProfiles/${userId}`);

  if (!afterData) {
    await publicRef.delete().catch((error) => {
      if (error?.code !== 5 && error?.code !== 404) throw error;
    });
    return;
  }

  await publicRef.set(
    {
      ...sanitizePublicProfile(userId, afterData),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: false }
  );
}

module.exports = {
  PUBLIC_SMART_PROFILE_FIELDS,
  publicProfileProjectionChanged,
  sanitizePublicProfile,
  sanitizePublicBio,
  sanitizePublicSmartProfile,
  syncPublicProfile,
};
