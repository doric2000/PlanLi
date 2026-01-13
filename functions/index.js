const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

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
