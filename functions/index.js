const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

async function updateCityRecommendationsCount({ countryId, cityId, delta }) {
  if (!countryId || !cityId || typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) return;

  const cityRef = admin.firestore().doc(`countries/${countryId}/cities/${cityId}`);
  await cityRef.set(
    {
      recommendationsCount: admin.firestore.FieldValue.increment(delta),
      recommendationsCountUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function assertSignedIn(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to call this function.'
    );
  }
}

function assertCallerIsAdmin(context) {
  const isAdmin = context.auth?.token?.admin === true;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required.');
  }
}

function normalizeBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

async function resolveTargetUid({ uid, email }) {
  if (typeof uid === 'string' && uid.trim()) return uid.trim();
  if (typeof email === 'string' && email.trim()) {
    const user = await admin.auth().getUserByEmail(email.trim());
    return user.uid;
  }
  throw new functions.https.HttpsError('invalid-argument', 'Provide either "uid" or "email".');
}

exports.setAdmin = functions.https.onCall(async (data, context) => {
  assertSignedIn(context);
  assertCallerIsAdmin(context);

  const uid = await resolveTargetUid({ uid: data?.uid, email: data?.email });
  const makeAdmin = normalizeBoolean(data?.admin, true);

  const targetUser = await admin.auth().getUser(uid);
  const existingClaims = targetUser.customClaims || {};

  const nextClaims = { ...existingClaims };
  if (makeAdmin) {
    nextClaims.admin = true;
  } else {
    delete nextClaims.admin;
  }

  await admin.auth().setCustomUserClaims(uid, nextClaims);

  return {
    ok: true,
    uid,
    admin: makeAdmin,
    // Caller info helps debugging
    actorUid: context.auth?.uid || null,
  };
});

exports.setUserVerified = functions.https.onCall(async (data, context) => {
  assertSignedIn(context);
  assertCallerIsAdmin(context);

  const verified = data?.verified;
  if (typeof verified !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'verified must be boolean.');
  }

  const uid = await resolveTargetUid({ uid: data?.uid, email: data?.email });
  await admin.auth().updateUser(uid, { emailVerified: verified });

  return {
    ok: true,
    uid,
    emailVerified: verified,
    actorUid: context.auth?.uid || null,
  };
});

// Keep an aggregated recommendations count on each city doc.
// City docs live at: countries/{countryId}/cities/{cityId}
// Recommendations contain: { countryId, cityId, ... }
exports.onRecommendationWrite = functions.firestore
  .document('recommendations/{recommendationId}')
  .onWrite(async (change) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    // Create
    if (!before && after) {
      await updateCityRecommendationsCount({
        countryId: after.countryId,
        cityId: after.cityId,
        delta: 1,
      });
      return;
    }

    // Delete
    if (before && !after) {
      await updateCityRecommendationsCount({
        countryId: before.countryId,
        cityId: before.cityId,
        delta: -1,
      });
      return;
    }

    // Update (handle city change)
    if (before && after) {
      const beforeKey = `${before.countryId || ''}/${before.cityId || ''}`;
      const afterKey = `${after.countryId || ''}/${after.cityId || ''}`;
      if (beforeKey !== afterKey) {
        await updateCityRecommendationsCount({
          countryId: before.countryId,
          cityId: before.cityId,
          delta: -1,
        });
        await updateCityRecommendationsCount({
          countryId: after.countryId,
          cityId: after.cityId,
          delta: 1,
        });
      }
    }
  });
