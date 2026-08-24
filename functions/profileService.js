const { HttpsError } = require('firebase-functions/v2/https');
const { evaluateTextSafety } = require('./moderationService');
const { validateMediaAssets } = require('./recommendationService');
const {
  PRIVACY_VERSION,
  PROFILE_DETAILS_VERSION,
  TERMS_VERSION,
  assertAccountSetupComplete,
} = require('./authPolicy');
const {
  BUDGET_IDS,
  INTEREST_IDS,
  NEED_IDS,
  PACE_IDS,
  TRAVELER_STYLE_IDS,
  TRAVEL_PARTY_IDS,
  VIBE_IDS,
  taxonomy,
  isSmartProfileComplete,
  normalizeSmartProfile,
  uniqueAllowed,
} = require('./travelTaxonomy');

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanOptionalName(value) {
  if (value == null) return undefined;
  assert(typeof value === 'string', 'invalid-argument', 'displayName must be a string.');
  const trimmed = value.trim();
  assert((trimmed.match(/\s/gu) || []).length <= 5,
    'invalid-argument', 'displayName may contain at most six words.');
  const result = trimmed.replace(/\s+/gu, ' ');
  const length = Array.from(result).length;
  assert(length >= 2 && length <= 60, 'invalid-argument', 'displayName is invalid.');
  return result;
}

function profilePolicyError(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function sanitizeProviderPhotoURL(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (
      parsed.protocol === 'https:'
      && (hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com'))
    ) {
      return parsed.toString().slice(0, 2000);
    }
  } catch {
    // Reject malformed provider URLs.
  }
  return null;
}

function cleanOptionalBio(value) {
  if (value == null) return undefined;
  assert(typeof value === 'string', 'invalid-argument', 'bio must be a string.');
  const result = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
  assert((result.match(/\n/g) || []).length <= 1, 'invalid-argument', 'bio may contain at most two lines.');
  assert(Array.from(result).length <= 160, 'invalid-argument', 'bio must be 160 characters or fewer.');
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
  const allowedFields = ['interests', 'budget', 'travelParties', 'vibe', 'travelerStyles', 'pace', 'needs', 'onboardingVersion'];
  assert(Object.keys(value).every((key) => allowedFields.includes(key)),
    'invalid-argument', 'smartProfile contains unsupported fields.');
  for (const [field, allowed, maximum] of [
    ['interests', INTEREST_IDS, 8],
    ['travelParties', TRAVEL_PARTY_IDS, 2],
    ['vibe', VIBE_IDS, 3],
    ['travelerStyles', TRAVELER_STYLE_IDS, 3],
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
    assert(value.pace === '' || PACE_IDS.includes(value.pace),
      'invalid-argument', 'smartProfile.pace is invalid.');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'onboardingVersion')) {
    assert(Number.isInteger(value.onboardingVersion) && value.onboardingVersion >= 1 && value.onboardingVersion <= 10,
      'invalid-argument', 'smartProfile.onboardingVersion is invalid.');
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
  const travelerStyles = assertOnlyAllowed(
    normalized.travelerStyles,
    TRAVELER_STYLE_IDS,
    'smartProfile.travelerStyles',
    3
  );
  const needs = assertOnlyAllowed(normalized.needs, NEED_IDS, 'smartProfile.needs', NEED_IDS.length);
  const budget = normalized.budget;
  assert(!budget || BUDGET_IDS.includes(budget), 'invalid-argument', 'smartProfile.budget is invalid.');
  if (complete) {
    const onboardingVersion = Number(value.onboardingVersion || 1);
    assert(interests.length >= (onboardingVersion >= 2 ? 2 : 3),
      'invalid-argument', 'Choose more travel interests.');
    assert(interests.length <= (onboardingVersion >= 2 ? 4 : 8),
      'invalid-argument', 'Too many travel interests were selected.');
    assert(Boolean(budget), 'invalid-argument', 'Choose a budget preference.');
    assert(travelParties.length >= 1, 'invalid-argument', 'Choose at least one travel party.');
  }
  return {
    interests,
    budget,
    travelParties,
    vibe,
    travelerStyles,
    pace: normalized.pace,
    needs,
    ...(value.onboardingVersion ? { onboardingVersion: value.onboardingVersion } : {}),
  };
}

function sanitizeNoyaOnboarding(value) {
  if (value == null) return undefined;
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'noyaOnboarding is invalid.');
  assert(Object.keys(value).every((key) => ['version', 'status'].includes(key)),
    'invalid-argument', 'noyaOnboarding contains unsupported fields.');
  assert(Number.isInteger(value.version) && value.version >= 1 && value.version <= 10,
    'invalid-argument', 'noyaOnboarding.version is invalid.');
  assert(['completed', 'dismissed'].includes(value.status),
    'invalid-argument', 'noyaOnboarding.status is invalid.');
  return { version: value.version, status: value.status };
}

async function updateProfile({ admin, auth, data, mediaBucket }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(data && typeof data === 'object' && !Array.isArray(data),
    'invalid-argument', 'Profile update is invalid.');
  assert(Object.keys(data).every((key) => (
    ['displayName', 'bio', 'smartProfile', 'completeSmartProfile', 'photoMedia', 'taxonomyVersion', 'noyaOnboarding'].includes(key)
  )), 'invalid-argument', 'נשלח שדה שאינו נתמך בעדכון הפרופיל.');
  if (Object.prototype.hasOwnProperty.call(data, 'completeSmartProfile')) {
    assert(typeof data.completeSmartProfile === 'boolean',
      'invalid-argument', 'completeSmartProfile must be boolean.');
  }
  const uid = auth.uid;
  const displayName = cleanOptionalName(data?.displayName);
  const bio = cleanOptionalBio(data?.bio);
  assert(evaluateTextSafety([displayName, bio]).safe, 'invalid-argument', 'Profile text cannot be published.');
  const completeSmartProfile = data?.completeSmartProfile === true;
  const smartProfile = sanitizeSmartProfile(data?.smartProfile, { complete: completeSmartProfile });
  const noyaOnboarding = sanitizeNoyaOnboarding(data?.noyaOnboarding);
  if (data?.smartProfile && Object.prototype.hasOwnProperty.call(data.smartProfile, 'budget')) {
    assert(Number(data.taxonomyVersion || 0) >= taxonomy.version, 'failed-precondition',
      'Update PlanLi to choose Free or Cheap as separate budget options.');
  }
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const existing = await userRef.get();
  const existingData = existing.exists ? existing.data() || {} : {};
  if (noyaOnboarding?.status === 'completed') {
    assert(
      (completeSmartProfile && smartProfile !== undefined)
        || isSmartProfileComplete(existingData.smartProfile || {}),
      'failed-precondition', 'Complete the travel preferences before finishing the Noa onboarding.');
  }
  if (smartProfile !== undefined || noyaOnboarding !== undefined) {
    assertAccountSetupComplete(auth, existing.exists ? existingData : null);
  }
  if (displayName !== undefined) {
    if (auth.token?.email_verified !== true) {
      profilePolicyError(
        'failed-precondition',
        'Email verification is required before changing the display name.',
        'EMAIL_VERIFICATION_REQUIRED'
      );
    }
    if (!existing.exists) {
      profilePolicyError(
        'failed-precondition',
        'Account setup is required before changing the display name.',
        'ACCOUNT_SETUP_REQUIRED'
      );
    }
  }
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
        existingMedia: existingData.photoMedia ? [existingData.photoMedia] : [],
      });
      photoMedia = validated[0];
    }
  }
  assert(
    displayName !== undefined || bio !== undefined || smartProfile !== undefined
      || photoMedia !== undefined || noyaOnboarding !== undefined,
    'invalid-argument',
    'No profile fields were provided.'
  );
  const existingSmartProfile = existingData.smartProfile || {};
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
    ...(bio !== undefined
      ? (bio ? { bio } : { bio: admin.firestore.FieldValue.delete() })
      : {}),
    ...(nextSmartProfile !== undefined ? { smartProfile: nextSmartProfile } : {}),
    ...(noyaOnboarding !== undefined
      ? {
          onboarding: {
            ...(existingData.onboarding || {}),
            noya: {
              ...noyaOnboarding,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
        }
      : {}),
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
  if (displayName !== undefined) {
    await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(userRef);
      const latest = latestSnapshot.exists ? latestSnapshot.data() || {} : {};
      if (latest?.profileManagement?.displayNameChangedAt) {
        profilePolicyError(
          'failed-precondition',
          'The display name can only be changed once.',
          'DISPLAY_NAME_CHANGE_ALREADY_USED'
        );
      }
      const currentName = String(latest.displayName || '').replace(/\s+/gu, ' ').trim();
      assert(currentName !== displayName, 'invalid-argument', 'Choose a different display name.');
      transaction.set(userRef, {
        ...fields,
        profileManagement: {
          ...(latest.profileManagement || {}),
          displayNameChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    });
  } else {
    await userRef.set(fields, { merge: true });
  }

  const authFields = {};
  if (displayName !== undefined) authFields.displayName = displayName;
  if (photoMedia !== undefined) authFields.photoURL = photoMedia?.feed?.url || null;
  if (Object.keys(authFields).length) {
    await admin.auth().updateUser(uid, authFields);
  }
  const persistedSnapshot = smartProfile !== undefined || noyaOnboarding !== undefined ? await userRef.get() : null;
  const persistedUserDocument = persistedSnapshot?.exists ? persistedSnapshot.data() || null : null;
  if (smartProfile !== undefined) {
    assert(persistedUserDocument, 'internal', 'The updated profile could not be read back.');
  }
  return {
    displayName: displayName ?? existingData.displayName ?? 'Traveler',
    ...(bio !== undefined ? { bio } : {}),
    ...(photoMedia !== undefined ? { photoMedia, photoURL: photoMedia?.feed?.url || null } : {}),
    ...(smartProfile !== undefined
      ? {
          smartProfile: persistedUserDocument.smartProfile,
          userDocument: persistedUserDocument,
        }
      : {}),
    ...(noyaOnboarding !== undefined
      ? { noyaOnboarding: persistedUserDocument?.onboarding?.noya || noyaOnboarding }
      : {}),
  };
}

async function registerUser({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(data == null || (data && typeof data === 'object' && !Array.isArray(data)),
    'invalid-argument', 'Registration profile is invalid.');
  assert(Object.keys(data || {}).every((key) => ['displayName', 'photoURL'].includes(key)),
    'invalid-argument', 'Registration profile contains unsupported fields.');
  const requestedDisplayName = cleanOptionalName(
    data?.displayName || auth.token?.name || 'מטייל/ת PlanLi'
  );
  const requestedPhotoURL = sanitizeProviderPhotoURL(data?.photoURL);
  const db = admin.firestore();
  const ref = db.doc(`users/${auth.uid}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() || {} : null;
    if (!existing) {
      const created = {
        uid: auth.uid,
        email: auth.token?.email || '',
        displayName: requestedDisplayName,
        photoURL: requestedPhotoURL,
        smartProfile: { setupRequired: true },
        moderation: { status: 'active' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      transaction.set(ref, created);
      return {
        uid: auth.uid,
        created: true,
        displayName: created.displayName,
        photoURL: created.photoURL,
        setupRequired: true,
      };
    }

    const patch = {};
    if (!existing.uid) patch.uid = auth.uid;
    if (!existing.email && auth.token?.email) patch.email = auth.token.email;
    if (!existing.displayName) patch.displayName = requestedDisplayName;
    if (!Object.prototype.hasOwnProperty.call(existing, 'photoURL')) {
      patch.photoURL = requestedPhotoURL;
    }
    if (!existing.smartProfile || typeof existing.smartProfile !== 'object') {
      patch.smartProfile = { setupRequired: true };
    } else if (
      !Object.prototype.hasOwnProperty.call(existing.smartProfile, 'setupRequired') &&
      !existing.smartProfile.completedAt
    ) {
      patch.smartProfile = { ...existing.smartProfile, setupRequired: true };
    }
    if (!existing.moderation || typeof existing.moderation !== 'object') {
      patch.moderation = { status: 'active' };
    }
    if (Object.keys(patch).length) {
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      transaction.set(ref, patch, { merge: true });
    }
    const smartProfile = patch.smartProfile || existing.smartProfile || {};
    const setupRequired = smartProfile.setupRequired === true;
    return {
      uid: auth.uid,
      created: false,
      displayName: patch.displayName || existing.displayName || requestedDisplayName,
      photoURL: Object.prototype.hasOwnProperty.call(patch, 'photoURL')
        ? patch.photoURL
        : (existing.photoURL ?? null),
      setupRequired,
    };
  });
}

async function completeAccountSetup({ admin, auth, data }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(data && typeof data === 'object' && !Array.isArray(data),
    'invalid-argument', 'Account setup is invalid.');
  assert(Object.keys(data).every((key) => ['displayName', 'acceptedLegal'].includes(key)),
    'invalid-argument', 'Account setup contains unsupported fields.');
  assert(data.acceptedLegal === true, 'failed-precondition', 'Legal consent is required.');
  const displayName = cleanOptionalName(data.displayName);
  assert(displayName && displayName.length >= 2, 'invalid-argument', 'displayName is invalid.');
  const db = admin.firestore();
  const ref = db.doc(`users/${auth.uid}`);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const resolvedDisplayName = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() || {} : {};
    const existingDisplayName = typeof existing.displayName === 'string'
      ? existing.displayName.trim()
      : '';
    const hasCompletedProfileDetails = Boolean(
      existingDisplayName
      && existing.onboarding?.profileDetailsVersion === PROFILE_DETAILS_VERSION
      && existing.onboarding?.profileDetailsCompletedAt
    );
    const storedDisplayName = hasCompletedProfileDetails ? existingDisplayName : displayName;
    transaction.set(ref, {
      uid: auth.uid,
      email: existing.email || auth.token?.email || '',
      displayName: storedDisplayName,
      photoURL: Object.prototype.hasOwnProperty.call(existing, 'photoURL')
        ? existing.photoURL
        : null,
      onboarding: {
        ...(existing.onboarding || {}),
        profileDetailsVersion: PROFILE_DETAILS_VERSION,
        profileDetailsCompletedAt: timestamp,
      },
      legal: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: timestamp,
      },
      smartProfile: existing.smartProfile && typeof existing.smartProfile === 'object'
        ? existing.smartProfile
        : { setupRequired: true },
      moderation: existing.moderation && typeof existing.moderation === 'object'
        ? existing.moderation
        : { status: 'active' },
      ...(snapshot.exists ? {} : { createdAt: timestamp }),
      updatedAt: timestamp,
    }, { merge: true });
    return storedDisplayName;
  });
  await admin.auth().updateUser(auth.uid, { displayName: resolvedDisplayName });
  return {
    displayName: resolvedDisplayName,
    profileDetailsVersion: PROFILE_DETAILS_VERSION,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  };
}

module.exports = {
  cleanOptionalBio,
  cleanOptionalName,
  completeAccountSetup,
  registerUser,
  sanitizeProviderPhotoURL,
  sanitizeSmartProfile,
  updateProfile,
};
