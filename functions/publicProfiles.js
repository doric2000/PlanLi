const {
  INTEREST_IDS,
  VIBE_IDS,
  isSmartProfileComplete,
} = require('./travelTaxonomy');
const {
  PRIVACY_VERSION,
  PROFILE_DETAILS_VERSION,
  TERMS_VERSION,
} = require('./authPolicy');

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

function sanitizePublicPhotoURL(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const trusted = hostname === 'firebasestorage.googleapis.com'
      || hostname === 'googleusercontent.com'
      || hostname.endsWith('.googleusercontent.com');
    return parsed.protocol === 'https:' && trusted ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isPublicProfileEligible(data) {
  return Boolean(
    data
    && typeof data.displayName === 'string'
    && data.displayName.trim().length >= 2
    && data.onboarding?.profileDetailsVersion === PROFILE_DETAILS_VERSION
    && data.onboarding?.profileDetailsCompletedAt
    && data.legal?.termsVersion === TERMS_VERSION
    && data.legal?.privacyVersion === PRIVACY_VERSION
    && data.legal?.acceptedAt
    && data.moderation?.status === 'active'
  );
}

function sanitizePublicProfile(userId, data = {}) {
  return compactObject({
    uid: userId,
    displayName:
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName.trim().slice(0, 80)
        : 'Traveler',
    photoURL: sanitizePublicPhotoURL(data.photoURL),
    photoMedia:
      data.photoMedia && typeof data.photoMedia === 'object'
        ? data.photoMedia
        : null,
    bio: sanitizePublicBio(data.bio),
    isExpert: data.isExpert === true,
    smartProfile: isSmartProfileComplete(data.smartProfile)
      ? sanitizePublicSmartProfile(data.smartProfile)
      : null,
  });
}

function publicProfileProjectionChanged(userId, before, after) {
  const beforeProjection = isPublicProfileEligible(before)
    ? { ...sanitizePublicProfile(userId, before), status: 'active' }
    : null;
  const afterProjection = isPublicProfileEligible(after)
    ? { ...sanitizePublicProfile(userId, after), status: 'active' }
    : null;
  return JSON.stringify(beforeProjection) !== JSON.stringify(afterProjection);
}

async function syncPublicProfile(admin, userId, afterData) {
  const publicRef = admin.firestore().doc(`publicProfiles/${userId}`);

  if (!isPublicProfileEligible(afterData)) {
    await publicRef.delete().catch((error) => {
      if (error?.code !== 5 && error?.code !== 404) throw error;
    });
    return;
  }

  await publicRef.set(
    {
      ...sanitizePublicProfile(userId, afterData),
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: false }
  );
}

module.exports = {
  PUBLIC_SMART_PROFILE_FIELDS,
  isPublicProfileEligible,
  publicProfileProjectionChanged,
  sanitizePublicProfile,
  sanitizePublicBio,
  sanitizePublicPhotoURL,
  sanitizePublicSmartProfile,
  syncPublicProfile,
};
