const { HttpsError } = require('firebase-functions/v2/https');
const { validateMediaAssets } = require('./recommendationService');

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanOptionalName(value) {
  if (value == null) return undefined;
  assert(typeof value === 'string', 'invalid-argument', 'displayName must be a string.');
  const result = value.trim();
  assert(result.length >= 1 && result.length <= 80, 'invalid-argument', 'displayName is invalid.');
  return result;
}

function cleanStringArray(value, field) {
  if (value == null) return [];
  assert(Array.isArray(value) && value.length <= 30, 'invalid-argument', `${field} is invalid.`);
  return Array.from(new Set(value.map((entry) => {
    assert(typeof entry === 'string', 'invalid-argument', `${field} is invalid.`);
    const text = entry.trim();
    assert(text.length >= 1 && text.length <= 80, 'invalid-argument', `${field} is invalid.`);
    return text;
  })));
}

function sanitizeSmartProfile(value) {
  if (value == null) return undefined;
  assert(value && typeof value === 'object' && !Array.isArray(value), 'invalid-argument', 'smartProfile is invalid.');
  const budget = typeof value.budget === 'string' ? value.budget.trim().slice(0, 80) : '';
  const travelStyleTag = typeof value.travelStyleTag === 'string'
    ? value.travelStyleTag.trim().slice(0, 80)
    : '';
  return {
    budget,
    travelStyleTag,
    interests: cleanStringArray(value.interests, 'smartProfile.interests'),
    vibe: cleanStringArray(value.vibe, 'smartProfile.vibe'),
  };
}

async function updateProfile({ admin, auth, data, mediaBucket }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const uid = auth.uid;
  const displayName = cleanOptionalName(data?.displayName);
  const smartProfile = sanitizeSmartProfile(data?.smartProfile);
  let photoMedia;
  if (data && Object.prototype.hasOwnProperty.call(data, 'photoMedia')) {
    if (data.photoMedia == null) {
      photoMedia = null;
    } else {
      assert(mediaBucket, 'failed-precondition', 'MEDIA_STORAGE_BUCKET is not configured.');
      const validated = await validateMediaAssets({
        admin,
        uid,
        media: [data.photoMedia],
        mediaBucket,
        maxAssets: 1,
      });
      photoMedia = validated[0];
    }
  }
  assert(
    displayName !== undefined || smartProfile !== undefined || photoMedia !== undefined,
    'invalid-argument',
    'No profile fields were provided.'
  );

  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const existing = await userRef.get();
  const fields = {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(smartProfile !== undefined ? { smartProfile } : {}),
    ...(photoMedia !== undefined
      ? {
          photoMedia,
          photoURL: photoMedia?.feed?.url || null,
        }
      : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!existing.exists) {
    Object.assign(fields, {
      uid,
      email: auth.token?.email || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await userRef.set(fields, { merge: true });

  const authFields = {};
  if (displayName !== undefined) authFields.displayName = displayName;
  if (photoMedia !== undefined) authFields.photoURL = photoMedia?.feed?.url || null;
  if (Object.keys(authFields).length) {
    await admin.auth().updateUser(uid, authFields);
  }
  return {
    displayName: displayName ?? existing.data()?.displayName ?? 'Traveler',
    ...(photoMedia !== undefined ? { photoMedia, photoURL: photoMedia?.feed?.url || null } : {}),
    ...(smartProfile !== undefined ? { smartProfile } : {}),
  };
}

async function registerUser({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  const displayName = cleanOptionalName(data?.displayName || auth.token?.name || 'Traveler');
  const photoURL = typeof data?.photoURL === 'string' && data.photoURL.startsWith('https://')
    ? data.photoURL.slice(0, 2000)
    : null;
  const ref = admin.firestore().doc(`users/${auth.uid}`);
  const snapshot = await ref.get();
  await ref.set({
    uid: auth.uid,
    email: auth.token?.email || '',
    displayName,
    photoURL,
    ...(snapshot.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { uid: auth.uid, displayName, photoURL };
}

module.exports = {
  registerUser,
  sanitizeSmartProfile,
  updateProfile,
};
