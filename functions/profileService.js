const { HttpsError } = require('firebase-functions/v2/https');
const { validateMediaAssets } = require('./recommendationService');
const {
  BUDGET_IDS,
  INTEREST_IDS,
  NEED_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
  normalizeSmartProfile,
  uniqueAllowed,
} = require('./travelTaxonomy');

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

function assertOnlyAllowed(values, allowed, field, maximum) {
  assert(Array.isArray(values) && values.length <= maximum, 'invalid-argument', `${field} is invalid.`);
  assert(values.every((entry) => typeof entry === 'string' && allowed.includes(entry)),
    'invalid-argument', `${field} is invalid.`);
  return uniqueAllowed(values, allowed, maximum);
}

function sanitizeSmartProfile(value, { complete = false } = {}) {
  if (value == null) return undefined;
  assert(value && typeof value === 'object' && !Array.isArray(value), 'invalid-argument', 'smartProfile is invalid.');
  const allowedFields = ['interests', 'budget', 'travelParties', 'vibe', 'pace', 'needs'];
  assert(Object.keys(value).every((key) => allowedFields.includes(key)),
    'invalid-argument', 'smartProfile contains unsupported fields.');
  for (const [field, allowed, maximum] of [
    ['interests', INTEREST_IDS, 8],
    ['travelParties', TRAVEL_PARTY_IDS, 2],
    ['vibe', VIBE_IDS, 3],
    ['needs', NEED_IDS, NEED_IDS.length],
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      assertOnlyAllowed(value[field], allowed, `smartProfile.${field}`, maximum);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'budget')) {
    assert(value.budget === '' || BUDGET_IDS.includes(value.budget),
      'invalid-argument', 'smartProfile.budget is invalid.');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'pace')) {
    assert(['', 'relaxed', 'balanced', 'packed'].includes(value.pace),
      'invalid-argument', 'smartProfile.pace is invalid.');
  }
  const normalized = normalizeSmartProfile(value);
  const interests = assertOnlyAllowed(normalized.interests, INTEREST_IDS, 'smartProfile.interests', 8);
  const travelParties = assertOnlyAllowed(
    normalized.travelParties,
    TRAVEL_PARTY_IDS,
    'smartProfile.travelParties',
    2
  );
  const vibe = assertOnlyAllowed(normalized.vibe, VIBE_IDS, 'smartProfile.vibe', 3);
  const needs = assertOnlyAllowed(normalized.needs, NEED_IDS, 'smartProfile.needs', NEED_IDS.length);
  const budget = normalized.budget;
  assert(!budget || BUDGET_IDS.includes(budget), 'invalid-argument', 'smartProfile.budget is invalid.');
  if (complete) {
    assert(interests.length >= 3, 'invalid-argument', 'Choose at least three interests.');
    assert(interests.length <= 8, 'invalid-argument', 'Choose no more than eight interests.');
    assert(Boolean(budget), 'invalid-argument', 'Choose a budget preference.');
    assert(travelParties.length >= 1, 'invalid-argument', 'Choose at least one travel party.');
  }
  return { interests, budget, travelParties, vibe, needs };
}

async function updateProfile({ admin, auth, data, mediaBucket }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(data && typeof data === 'object' && !Array.isArray(data),
    'invalid-argument', 'Profile update is invalid.');
  assert(Object.keys(data).every((key) => (
    ['displayName', 'smartProfile', 'completeSmartProfile', 'photoMedia'].includes(key)
  )), 'invalid-argument', 'Profile update contains unsupported fields.');
  if (Object.prototype.hasOwnProperty.call(data, 'completeSmartProfile')) {
    assert(typeof data.completeSmartProfile === 'boolean',
      'invalid-argument', 'completeSmartProfile must be boolean.');
  }
  const uid = auth.uid;
  const displayName = cleanOptionalName(data?.displayName);
  const completeSmartProfile = data?.completeSmartProfile === true;
  const smartProfile = sanitizeSmartProfile(data?.smartProfile, { complete: completeSmartProfile });
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
  const existingSmartProfile = existing.data()?.smartProfile || {};
  const nextSmartProfile = smartProfile === undefined
    ? undefined
    : {
        ...smartProfile,
        setupRequired: completeSmartProfile
          ? false
          : existingSmartProfile.setupRequired === true,
        ...(completeSmartProfile
          ? { completedAt: admin.firestore.FieldValue.serverTimestamp() }
          : existingSmartProfile.completedAt
            ? { completedAt: existingSmartProfile.completedAt }
            : {}),
      };
  const fields = {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(nextSmartProfile !== undefined ? { smartProfile: nextSmartProfile } : {}),
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
  assert(data == null || (data && typeof data === 'object' && !Array.isArray(data)),
    'invalid-argument', 'Registration profile is invalid.');
  assert(Object.keys(data || {}).every((key) => ['displayName', 'photoURL'].includes(key)),
    'invalid-argument', 'Registration profile contains unsupported fields.');
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
    ...(snapshot.exists
      ? {}
      : {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          smartProfile: { setupRequired: true },
        }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { uid: auth.uid, displayName, photoURL };
}

module.exports = {
  registerUser,
  sanitizeSmartProfile,
  updateProfile,
};
