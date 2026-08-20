const { exactPlaceGoogleCacheFor, googleCacheFor } = require('./legacyPlacesAdapter');
const { fetchBilingualPlace } = require('./placesProviderAdapter');
const { buildMapLocation } = require('./mapLocation');

const CACHE_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return Date.parse(value) || 0;
}

function hasUsableDestinationCache(destination, nowMs = Date.now()) {
  if (Number(destination?.schemaVersion || 0) < 3) return true;
  return Boolean(
    destination?.googleCache?.names?.he &&
    destination?.googleCache?.names?.en &&
    millis(destination?.googleCache?.expiresAt) > nowMs
  );
}

function cachedProviderLoad(cache, placeId, loader) {
  if (!cache.has(placeId)) cache.set(placeId, Promise.resolve().then(loader));
  return cache.get(placeId);
}

function retryAt(now) {
  return new Date(now.getTime() + CACHE_RETRY_DELAY_MS);
}

async function refreshDestinationCaches({
  admin,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  fetchImpl = global.fetch,
  limit = 25,
  now = new Date(),
}) {
  const db = admin.firestore();
  const snapshot = await db.collectionGroup('destinations')
    .where('status', '==', 'active')
    .where('googleCache.refreshAfter', '<=', now)
    .orderBy('googleCache.refreshAfter')
    .limit(limit)
    .get();
  const results = [];
  const providerLoads = new Map();
  for (const document of snapshot.docs) {
    const destination = document.data() || {};
    const placeId = destination.providerRefs?.googlePlaceId;
    try {
      const bilingual = await cachedProviderLoad(providerLoads, placeId, () =>
        fetchBilingualPlace({
          provider: placesProvider, placeId, mapsKey, newPlacesKey, fetchImpl,
        })
      );
      if (bilingual.he.placeId !== placeId || bilingual.en.placeId !== placeId) {
        throw new Error('Google returned a different destination Place ID.');
      }
      const cache = googleCacheFor({ ...bilingual, fetchedAt: now });
      await document.ref.update({
        googleCache: cache,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push({ path: document.ref.path, state: 'ready' });
    } catch (error) {
      // Provider outages must never erase the last known-good normalized location.
      // Push refreshAfter forward so the scheduler retries without hammering Google.
      await document.ref.update({
        'googleCache.refreshAfter': retryAt(now),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push({ path: document.ref.path, state: 'retry', error: error?.message });
    }
  }
  return results;
}

function exactPlaceFromBilingual(bilingual, fetchedAt) {
  const he = bilingual.he;
  const en = bilingual.en;
  return {
    placeId: he.placeId,
    name: he.displayName || en.displayName || null,
    address: he.address || en.address || null,
    coordinates: he.coordinates || en.coordinates || null,
    googleCache: {
      ...exactPlaceGoogleCacheFor({ he, en, fetchedAt }),
      addresses: { he: he.address || '', en: en.address || '' },
    },
  };
}

async function refreshExactPlaceCaches({
  admin,
  mapsKey,
  newPlacesKey,
  placesProvider = 'legacy',
  fetchImpl = global.fetch,
  limit = 50,
  now = new Date(),
}) {
  const db = admin.firestore();
  const recommendations = await db.collection('recommendations')
    .where('status', '==', 'active')
    .where('place.googleCache.refreshAfter', '<=', now)
    .orderBy('place.googleCache.refreshAfter')
    .limit(limit)
    .get();
  const remaining = Math.max(0, limit - recommendations.size);
  const stops = remaining
    ? await db.collectionGroup('stops')
      .where('place.googleCache.refreshAfter', '<=', now)
      .orderBy('place.googleCache.refreshAfter')
      .limit(remaining)
      .get()
    : { docs: [] };
  const results = [];
  const providerLoads = new Map();
  for (const document of [...recommendations.docs, ...stops.docs]) {
    const data = document.data() || {};
    const placeId = data.place?.placeId;
    const isRecommendation = document.ref.path.startsWith('recommendations/');
    if (!isRecommendation) {
      const segments = document.ref.path.split('/');
      const routeSnapshot = await db.doc(`routes/${segments[1]}`).get();
      const revisionSnapshot = await db.doc(`routes/${segments[1]}/revisions/${segments[3]}`).get();
      if (!routeSnapshot.exists || routeSnapshot.data()?.status !== 'active' ||
          routeSnapshot.data()?.activeRevisionId !== segments[3] || revisionSnapshot.data()?.state !== 'active') {
        continue;
      }
    }
    try {
      const bilingual = await cachedProviderLoad(providerLoads, placeId, () =>
        fetchBilingualPlace({
          provider: placesProvider, placeId, mapsKey, newPlacesKey, fetchImpl,
        })
      );
      const place = exactPlaceFromBilingual(bilingual, now);
      await document.ref.update({
        place,
        ...(isRecommendation ? { mapLocation: buildMapLocation(place.coordinates) } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push({ path: document.ref.path, state: 'ready' });
    } catch (error) {
      await document.ref.update({
        'place.googleCache.refreshAfter': retryAt(now),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push({ path: document.ref.path, state: 'retry', error: error?.message });
    }
  }
  return results;
}

module.exports = {
  cachedProviderLoad,
  hasUsableDestinationCache,
  millis,
  refreshDestinationCaches,
  refreshExactPlaceCaches,
};
