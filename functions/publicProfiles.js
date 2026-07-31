const PUBLIC_SMART_PROFILE_FIELDS = [
  'interests',
  'vibe',
];

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function sanitizePublicSmartProfile(smartProfile) {
  if (!smartProfile || typeof smartProfile !== 'object') return null;

  const result = {};
  for (const key of PUBLIC_SMART_PROFILE_FIELDS) {
    const value = smartProfile[key];
    if (Array.isArray(value)) {
      result[key] = value
        .filter((entry) => typeof entry === 'string')
        .slice(0, 30);
    } else if (typeof value === 'string' && value.trim()) {
      result[key] = value.trim().slice(0, 80);
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
    isExpert: data.isExpert === true,
    smartProfile: sanitizePublicSmartProfile(data.smartProfile),
  });
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
  sanitizePublicProfile,
  sanitizePublicSmartProfile,
  syncPublicProfile,
};
