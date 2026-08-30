const crypto = require('crypto');

const CONTAINING_PLACES_PRO_MONTHLY_LIMIT = 4500;

const DIRECT_DESTINATION_TYPES = Object.freeze([
  'locality',
  'postal_town',
  'island',
  'administrative_area_level_3',
  'administrative_area_level_2',
  'administrative_area_level_1',
]);
const EXPLICIT_NATURAL_DESTINATION_TYPES = Object.freeze([
  'natural_feature',
  'national_park',
  'park',
]);
const DESTINATION_AUTOCOMPLETE_TYPES = new Set([
  ...DIRECT_DESTINATION_TYPES,
  ...EXPLICIT_NATURAL_DESTINATION_TYPES,
]);

function provisionalRegistryId(countryCode, providerPlaceId) {
  const code = String(countryCode || '').trim().toLowerCase() || 'xx';
  const digest = crypto.createHash('sha256')
    .update(String(providerPlaceId || '').trim())
    .digest('base64url')
    .slice(0, 16)
    .toLowerCase();
  return `${code}-provisional-${digest}`;
}

function provisionalDestinationKind(types = []) {
  const values = new Set(Array.isArray(types) ? types : []);
  if (values.has('island') || values.has('archipelago')) return 'island';
  if (values.has('administrative_area_level_1') || values.has('administrative_area_level_2')) {
    return 'province';
  }
  if (['natural_feature', 'national_park', 'park'].some((type) => values.has(type))) {
    return 'natural_feature';
  }
  if (values.has('colloquial_area')) return 'tourism_region';
  return 'city_hub';
}

function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7).replace('-', '');
}

async function consumeContainingPlacesProBudget(admin, now = new Date()) {
  const db = admin.firestore();
  const key = monthKey(now);
  const ref = db.doc(`system/runtime/providerUsage/containingPlacesPro_${key}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = Math.max(0, Number(snapshot.data()?.count || 0));
    if (count >= CONTAINING_PLACES_PRO_MONTHLY_LIMIT) return false;
    transaction.set(ref, {
      count: count + 1,
      month: key,
      limit: CONTAINING_PLACES_PRO_MONTHLY_LIMIT,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    }, { merge: true });
    return true;
  });
}

module.exports = {
  CONTAINING_PLACES_PRO_MONTHLY_LIMIT,
  DESTINATION_AUTOCOMPLETE_TYPES,
  DIRECT_DESTINATION_TYPES,
  EXPLICIT_NATURAL_DESTINATION_TYPES,
  consumeContainingPlacesProBudget,
  monthKey,
  provisionalDestinationKind,
  provisionalRegistryId,
};
