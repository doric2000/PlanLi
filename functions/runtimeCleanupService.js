const RUNTIME_COLLECTIONS = Object.freeze([
  'system/runtime/publicRateLimits',
  'system/runtime/guestSessions',
  'system/runtime/guestSessionNonces',
  'system/runtime/guestSessionIssuance',
  'system/runtime/providerRateLimits',
  'system/runtime/providerGlobalLimits',
  'system/runtime/placeSearchSessions',
  'system/runtime/resolvedPlaceTokens',
  'system/runtime/destinationResolutionChoices',
]);

const EXPIRY_FIELDS = Object.freeze({
  'system/runtime/placeSearchSessions': 'expiresAt',
  'system/runtime/resolvedPlaceTokens': 'expiresAt',
  'system/runtime/destinationResolutionChoices': 'expiresAt',
});

async function cleanupExpiredCollection(db, collectionPath, now, limit) {
  const snapshot = await db.collection(collectionPath)
    .where(EXPIRY_FIELDS[collectionPath] || 'expireAt', '<=', now)
    .limit(limit)
    .get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
}

async function cleanupExpiredRuntimeDocuments({ admin, limit = 200, now = new Date() }) {
  const db = admin.firestore();
  const deleted = {};
  for (const collectionPath of RUNTIME_COLLECTIONS) {
    deleted[collectionPath] = await cleanupExpiredCollection(db, collectionPath, now, limit);
  }
  return deleted;
}

module.exports = {
  RUNTIME_COLLECTIONS,
  EXPIRY_FIELDS,
  cleanupExpiredCollection,
  cleanupExpiredRuntimeDocuments,
};
