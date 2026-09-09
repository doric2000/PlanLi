const { HttpsError } = require('firebase-functions/v2/https');
const { isDiscoveryRegionId } = require('./discoveryRegions');

async function setDiscoveryRegion({ admin, auth, data }) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const global = data?.mode === 'global' && data?.regionId == null;
  const regional = (data?.mode == null || data.mode === 'region') && isDiscoveryRegionId(data?.regionId);
  if (!global && !regional) {
    throw new HttpsError('invalid-argument', 'regionId is invalid.');
  }
  const ref = admin.firestore().doc(`users/${auth.uid}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('failed-precondition', 'Profile setup is unavailable.');
  const selectedAt = admin.firestore.FieldValue.serverTimestamp();
  const preference = { schemaVersion: 2, mode: global ? 'global' : 'region', regionId: global ? null : data.regionId };
  await ref.set({
    discoveryRegion: { ...preference, selectedAt },
    updatedAt: selectedAt,
  }, { merge: true });
  return preference;
}

module.exports = { setDiscoveryRegion };
