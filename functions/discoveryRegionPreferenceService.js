const { HttpsError } = require('firebase-functions/v2/https');
const { isDiscoveryRegionId } = require('./discoveryRegions');

async function setDiscoveryRegion({ admin, auth, data }) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  if (!isDiscoveryRegionId(data?.regionId)) {
    throw new HttpsError('invalid-argument', 'regionId is invalid.');
  }
  const ref = admin.firestore().doc(`users/${auth.uid}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('failed-precondition', 'Profile setup is unavailable.');
  const selectedAt = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    discoveryRegion: { schemaVersion: 1, regionId: data.regionId, selectedAt },
    updatedAt: selectedAt,
  }, { merge: true });
  return { schemaVersion: 1, regionId: data.regionId };
}

module.exports = { setDiscoveryRegion };
