const { HttpsError } = require('firebase-functions/v2/https');
const { hasActiveAdminAccess } = require('./adminAuthorization');
const { isVerifiedCaller, validateMediaAssets } = require('./recommendationService');
const { evaluateTextSafety } = require('./moderationService');
const { destinationHebrewName } = require('./destinationLocalizationService');
const {
  destinationAcceptsNewReferences,
  isDestinationReassigning,
} = require('./destinationReferencePolicy');

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
      city.exists && destinationAcceptsNewReferences(city.data()),
    'not-found',
    'Destination does not exist.'
  );
  return {
    countryId,
    cityId,
    countryName: country.data().name || countryId,
    cityName: destinationHebrewName(city.data()) || cityId,
    cityRef: city.ref || db.doc(`countries/${countryId}/destinations/${cityId}`),
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
  await db.runTransaction(async (transaction) => {
    const [current, city] = await Promise.all([
      transaction.get(tripRef),
      destination ? transaction.get(destination.cityRef) : Promise.resolve(null),
    ]);
    if (tripId) {
      assert(current.exists, 'not-found', 'Trip no longer exists.');
      assert(current.data()?.ownerId === auth.uid || isAdmin, 'permission-denied',
        'Trip ownership changed.');
    } else {
      assert(!current.exists, 'already-exists', 'Trip already exists.');
    }
    const previousDestination = current.data()?.destination;
    const previousDestinationChanged = previousDestination?.countryId && previousDestination?.cityId &&
      (!destination || previousDestination.countryId !== destination.countryId ||
        previousDestination.cityId !== destination.cityId);
    const previousCity = previousDestinationChanged
      ? await transaction.get(db.doc(
        `countries/${previousDestination.countryId}/destinations/${previousDestination.cityId}`
      ))
      : null;
    assert(!previousCity?.exists || !isDestinationReassigning(previousCity.data()),
      'failed-precondition', 'The trip destination is being reassigned. Try again shortly.');
    const canonicalDestination = destination ? {
      countryId: destination.countryId,
      cityId: destination.cityId,
      countryName: destination.countryName,
      cityName: destinationHebrewName(city.data()) || destination.cityId,
    } : null;
    assert(!destination || (city.exists && destinationAcceptsNewReferences(city.data()) && canonicalDestination.cityName),
      'failed-precondition', 'Destination is no longer available.');
    transaction.set(tripRef, {
      ownerId: current.exists ? current.data().ownerId : auth.uid,
      title,
      description,
      status: current.exists && current.data()?.status !== 'active'
        ? current.data().status
        : (textSafety.safe ? 'active' : 'moderation_hold'),
      ...(!textSafety.safe ? { moderation: { holdReason: textSafety.reason } } : {}),
      destination: canonicalDestination,
      media,
      stats: current.exists
        ? current.data().stats || { likeCount: 0, commentCount: 0 }
        : { likeCount: 0, commentCount: 0 },
      createdAt: current.exists ? current.data().createdAt : now,
      updatedAt: now,
    });
  });
  return { tripId: tripRef.id };
}

module.exports = { saveTrip };
