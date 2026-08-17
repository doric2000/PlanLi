const { HttpsError } = require('firebase-functions/v2/https');
const { hasActiveAdminAccess } = require('./adminAuthorization');
const { isVerifiedCaller, validateMediaAssets } = require('./recommendationService');
const { evaluateTextSafety } = require('./moderationService');

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function cleanString(value, field, maximum) {
  assert(typeof value === 'string', 'invalid-argument', `${field} must be a string.`);
  const text = value.trim();
  assert(text.length >= 1 && text.length <= maximum, 'invalid-argument', `${field} is invalid.`);
  return text;
}

function cleanId(value, field) {
  const text = cleanString(value, field, 180);
  assert(!text.includes('/'), 'invalid-argument', `${field} is invalid.`);
  return text;
}

async function resolveDestination(db, destination) {
  if (destination == null) return null;
  assert(destination && typeof destination === 'object', 'invalid-argument', 'destination is invalid.');
  const countryId = cleanId(destination.countryId, 'destination.countryId');
  const cityId = cleanId(destination.cityId, 'destination.cityId');
  const [country, city] = await Promise.all([
    db.doc(`countries/${countryId}`).get(),
    db.doc(`countries/${countryId}/destinations/${cityId}`).get(),
  ]);
  assert(
    country.exists && country.data()?.status === 'active' &&
      city.exists && city.data()?.status === 'active',
    'not-found',
    'Destination does not exist.'
  );
  return {
    countryId,
    cityId,
    countryName: country.data().name || countryId,
    cityName: city.data().name || cityId,
  };
}

async function saveTrip({ admin, auth, data, mediaBucket }) {
  assert(auth?.uid, 'unauthenticated', 'You must be signed in.');
  assert(isVerifiedCaller(auth), 'permission-denied', 'Email verification is required.');
  const db = admin.firestore();
  const tripId = data?.tripId ? cleanId(data.tripId, 'tripId') : null;
  const tripRef = tripId ? db.doc(`trips/${tripId}`) : db.collection('trips').doc();
  const input = data?.trip || {};
  const title = cleanString(input.title, 'title', 120);
  const description = cleanString(input.description, 'description', 5000);
  const textSafety = evaluateTextSafety([title, description]);
  const existing = await tripRef.get();
  const isAdmin = tripId ? await hasActiveAdminAccess({ admin, auth }) : false;
  if (tripId) {
    assert(existing.exists, 'not-found', 'Trip does not exist.');
    assert(
      existing.data()?.ownerId === auth.uid || isAdmin,
      'permission-denied',
      'You do not own this trip.'
    );
  }
  const media = await validateMediaAssets({
    admin,
    uid: auth.uid,
    media: Array.isArray(input.media) ? input.media : [],
    mediaBucket,
    maxAssets: 20,
    existingMedia: existing.data()?.media,
  });
  const destination = await resolveDestination(db, input.destination);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await tripRef.set({
    ownerId: existing.exists ? existing.data().ownerId : auth.uid,
    title,
    description,
    status: existing.exists && existing.data()?.status !== 'active'
      ? existing.data().status
      : (textSafety.safe ? 'active' : 'moderation_hold'),
    ...(!textSafety.safe ? { moderation: { holdReason: textSafety.reason } } : {}),
    destination,
    media,
    stats: existing.exists
      ? existing.data().stats || { likeCount: 0, commentCount: 0 }
      : { likeCount: 0, commentCount: 0 },
    createdAt: existing.exists ? existing.data().createdAt : now,
    updatedAt: now,
  });
  return { tripId: tripRef.id };
}

module.exports = { saveTrip };
