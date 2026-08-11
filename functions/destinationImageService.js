const { FieldPath } = require('firebase-admin/firestore');
const { cityName, resolveWikidataIdentity } = require('./destinationIdentityService');

const MAX_IMAGE_SYNC_ATTEMPTS = 6;
const IDENTITY_STRATEGY_VERSION = 2;
const RECOMMENDATION_PAGE_SIZE = 100;
const UTM_SOURCE = 'planli';
const UTM_MEDIUM = 'referral';

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && Number.isFinite(value._seconds)) {
    return value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1e6);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function addUtm(value) {
  if (!isHttpsUrl(value)) return null;
  const url = new URL(value);
  url.searchParams.set('utm_source', UTM_SOURCE);
  url.searchParams.set('utm_medium', UTM_MEDIUM);
  return url.toString();
}

function resizeUnsplashUrl(value, width) {
  if (!isHttpsUrl(value)) return null;
  const url = new URL(value);
  url.searchParams.set('auto', 'format');
  url.searchParams.set('fit', 'max');
  url.searchParams.set('q', '80');
  url.searchParams.set('w', String(width));
  return url.toString();
}

function recommendationMediaImage(recommendationId, recommendation) {
  const media = Array.isArray(recommendation?.media) ? recommendation.media : [];
  const asset = media.find((entry) =>
    entry?.assetId &&
    isHttpsUrl(entry?.large?.url) &&
    isHttpsUrl(entry?.feed?.url) &&
    isHttpsUrl(entry?.thumb?.url)
  );
  if (!asset) return null;
  return {
    source: {
      type: 'recommendation',
      recommendationId,
      assetId: asset.assetId,
    },
    urls: {
      large: asset.large.url,
      feed: asset.feed.url,
      thumb: asset.thumb.url,
    },
    width: Number(asset.large?.width || 0),
    height: Number(asset.large?.height || 0),
    color: asset.placeholder?.color || null,
    blurHash: null,
    alt: String(recommendation?.title || '').trim() || null,
    selection: {
      strategy: 'most_popular_with_image',
    },
  };
}

function selectMostPopularRecommendationImage(entries) {
  const ranked = (entries || [])
    .map((entry) => {
      const data = typeof entry?.data === 'function' ? entry.data() : entry?.data || entry;
      const id = entry?.id || data?.id;
      return { id, data };
    })
    .filter(({ id, data }) => id && data?.status === 'active')
    .sort((a, b) =>
      Number(b.data?.stats?.likeCount || 0) - Number(a.data?.stats?.likeCount || 0) ||
      timestampMs(b.data?.createdAt) - timestampMs(a.data?.createdAt) ||
      String(a.id).localeCompare(String(b.id))
    );
  for (const entry of ranked) {
    const image = recommendationMediaImage(entry.id, entry.data);
    if (image) return image;
  }
  return null;
}

function buildUnsplashDestinationImage(photo, query) {
  const raw = photo?.urls?.raw;
  const large = resizeUnsplashUrl(raw, 1600);
  const feed = resizeUnsplashUrl(raw, 1080);
  const thumb = resizeUnsplashUrl(raw, 400);
  if (!photo?.id || !large || !feed || !thumb) return null;
  const photographerProfileUrl = addUtm(photo?.user?.links?.html);
  const photoUrl = addUtm(photo?.links?.html);
  if (!photo?.user?.name || !photographerProfileUrl || !photoUrl) return null;
  return {
    source: {
      type: 'unsplash',
      providerPhotoId: photo.id,
    },
    urls: { large, feed, thumb },
    width: Number(photo.width || 0),
    height: Number(photo.height || 0),
    color: photo.color || null,
    blurHash: photo.blur_hash || null,
    alt: String(photo.alt_description || photo.description || query || '').trim() || null,
    attribution: {
      photographerName: photo.user.name,
      photographerProfileUrl,
      photoUrl,
      providerName: 'Unsplash',
      providerUrl: `https://unsplash.com/?utm_source=${UTM_SOURCE}&utm_medium=${UTM_MEDIUM}`,
    },
    selection: {
      strategy: 'top_relevant',
      query,
      rank: 1,
    },
  };
}

function addressComponent(result, ...types) {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  for (const type of types) {
    const found = components.find((entry) => entry.types?.includes(type));
    if (found) return found.long_name || found.short_name || null;
  }
  return null;
}

function destinationQuery(city, country) {
  const googleNames = city?.googleCache?.names || {};
  const names = city?.identity?.names || {};
  const identityCountryNames = city?.identity?.countryNames || {};
  const countryNames = country?.names || {};
  const cityLabel = String(googleNames.en || names.en || names.he || cityName(city)).trim();
  const countryCode = String(city?.googleCache?.countryCode || city?.identity?.countryCode || country?.code || '').trim().toUpperCase();
  const localEnglishCountryName = /^[A-Z]{2}$/.test(countryCode)
    ? new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode)
    : '';
  const countryLabel = String(countryNames.en || identityCountryNames.en || localEnglishCountryName || '').trim();
  return [cityLabel, countryLabel]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

async function searchUnsplash({ query, accessKey, fetchImpl = global.fetch }) {
  if (!accessKey) throw new Error('UNSPLASH_ACCESS_KEY is not configured.');
  if (!query) return { image: null, downloadLocation: null, rateLimit: null };
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('order_by', 'relevant');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');
  url.searchParams.set('per_page', '1');
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  });
  if (!response.ok) {
    const error = new Error(`Unsplash search failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  const photo = payload?.results?.[0] || null;
  const image = photo ? buildUnsplashDestinationImage(photo, query) : null;
  if (photo && !image) throw new Error('Unsplash returned an incomplete photo result.');
  const rateLimitValue = (name) => {
    const value = response.headers?.get?.(name);
    return value === null || value === undefined || value === '' ? null : Number(value);
  };
  return {
    image,
    downloadLocation: photo?.links?.download_location || null,
    rateLimit: {
      limit: rateLimitValue('x-ratelimit-limit'),
      remaining: rateLimitValue('x-ratelimit-remaining'),
    },
  };
}

async function trackUnsplashDownload({ downloadLocation, accessKey, fetchImpl = global.fetch }) {
  if (!downloadLocation) return;
  if (!isHttpsUrl(downloadLocation)) throw new Error('Invalid Unsplash download tracking URL.');
  const response = await fetchImpl(downloadLocation, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  });
  if (!response.ok) throw new Error(`Unsplash download tracking failed with HTTP ${response.status}.`);
}

async function selectRecommendationFallback(db, countryId, cityId) {
  let query = db.collection('recommendations')
    .where('destination.countryId', '==', countryId)
    .where('destination.cityId', '==', cityId)
    .where('status', '==', 'active')
    .orderBy('stats.likeCount', 'desc')
    .orderBy('createdAt', 'desc')
    .orderBy(FieldPath.documentId(), 'asc')
    .limit(RECOMMENDATION_PAGE_SIZE);
  while (query) {
    const snapshot = await query.get();
    for (const recommendation of snapshot.docs) {
      const image = recommendationMediaImage(recommendation.id, recommendation.data());
      if (image) return image;
    }
    query = snapshot.size === RECOMMENDATION_PAGE_SIZE
      ? query.startAfter(snapshot.docs[snapshot.docs.length - 1])
      : null;
  }
  return null;
}

async function resolveDestinationImageCandidate({
  db,
  city,
  country,
  countryId,
  cityId,
  unsplashKey,
  fetchImpl = global.fetch,
  query,
}) {
  if (!query) {
    const image = await selectRecommendationFallback(db, countryId, cityId);
    return { image, downloadLocation: null, rateLimit: null, state: image ? 'ready' : 'no_match' };
  }
  const unsplash = await searchUnsplash({ query, accessKey: unsplashKey, fetchImpl });
  if (unsplash.image) {
    return { ...unsplash, state: 'ready' };
  }
  const image = await selectRecommendationFallback(db, countryId, cityId);
  return {
    image,
    downloadLocation: null,
    rateLimit: unsplash.rateLimit,
    state: image ? 'ready' : 'no_match',
  };
}

function sameDestinationImage(left, right) {
  return left?.source?.type === right?.source?.type &&
    left?.source?.providerPhotoId === right?.source?.providerPhotoId &&
    left?.source?.recommendationId === right?.source?.recommendationId &&
    left?.source?.assetId === right?.source?.assetId &&
    left?.urls?.large === right?.urls?.large &&
    left?.urls?.feed === right?.urls?.feed &&
    left?.urls?.thumb === right?.urls?.thumb;
}

function destinationImageWritePatch(admin, image) {
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const deleteField = admin.firestore.FieldValue.delete();
  return {
    destinationImage: image
      ? {
          ...image,
          selection: {
            ...(image.selection || {}),
            selectedAt: timestamp,
          },
        }
      : deleteField,
    imageUrl: deleteField,
    externalImageUrl: deleteField,
    updatedAt: timestamp,
  };
}

function destinationJobRef(db, countryId, cityId) {
  return db.doc(`system/runtime/destinationJobs/${countryId}_${cityId}`);
}

function retryDelayMs(attempts) {
  return [5 * 60e3, 30 * 60e3, 2 * 60 * 60e3, 12 * 60 * 60e3, 24 * 60 * 60e3, 72 * 60 * 60e3]
    [Math.max(0, Math.min(5, attempts - 1))];
}

async function resolveAndPersistDestinationIdentity({ admin, countryId, cityId, fetchImpl = global.fetch }) {
  const db = admin.firestore();
  const cityRef = db.doc(`countries/${countryId}/cities/${cityId}`);
  const countryRef = db.doc(`countries/${countryId}`);
  const jobRef = destinationJobRef(db, countryId, cityId);
  const [citySnapshot, countrySnapshot] = await Promise.all([cityRef.get(), countryRef.get()]);
  if (!citySnapshot.exists || !countrySnapshot.exists) return { state: 'missing_city' };
  const city = citySnapshot.data() || {};
  if (city.identity?.source === 'wikidata' && city.identity?.names?.en) return { state: 'ready', identity: city.identity };
  const prior = (await jobRef.get()).data()?.identitySync || {};
  const attempts = Number(prior.attempts || 0) + 1;
  try {
    const identity = await resolveWikidataIdentity({ city, country: countrySnapshot.data(), fetchImpl });
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    if (!identity) {
      await jobRef.set({
        countryId, cityId,
        identitySync: { state: 'needs_review', strategyVersion: IDENTITY_STRATEGY_VERSION, attempts, lastAttemptAt: timestamp },
        updatedAt: timestamp,
      }, { merge: true });
      return { state: 'needs_review' };
    }
    await cityRef.set({
      schemaVersion: 2,
      identity: { ...identity, resolvedAt: timestamp },
      providerRefs: {
        googlePlaceId: city?.providerRefs?.googlePlaceId || city?.providerIds?.googlePlaceIds?.[0] || null,
      },
      createdAt: city.createdAt || timestamp,
      updatedAt: timestamp,
    }, { merge: true });
    await jobRef.set({
      countryId, cityId,
      identitySync: { state: 'ready', strategyVersion: IDENTITY_STRATEGY_VERSION, attempts, lastAttemptAt: timestamp },
      imageSync: { state: 'pending', attempts: 0, query: `${identity.names.en} ${identity.countryNames.en || countrySnapshot.data()?.names?.en || countrySnapshot.data()?.name || ''}`.trim() },
      updatedAt: timestamp,
    }, { merge: true });
    return { state: 'ready', identity };
  } catch (error) {
    const state = attempts >= MAX_IMAGE_SYNC_ATTEMPTS ? 'failed' : 'retry';
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await jobRef.set({
      countryId, cityId,
      identitySync: { state, strategyVersion: IDENTITY_STRATEGY_VERSION, attempts, lastAttemptAt: timestamp, ...(state === 'retry' ? { nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)) } : {}), lastErrorCode: String(error?.status || error?.code || 'wikidata_error') },
      updatedAt: timestamp,
    }, { merge: true });
    return { state, error };
  }
}

async function resolveAndPersistDestinationImage({
  admin,
  countryId,
  cityId,
  unsplashKey,
  fetchImpl = global.fetch,
  force = false,
}) {
  const db = admin.firestore();
  const cityRef = db.doc(`countries/${countryId}/cities/${cityId}`);
  const countryRef = db.doc(`countries/${countryId}`);
  const [citySnapshot, countrySnapshot] = await Promise.all([cityRef.get(), countryRef.get()]);
  if (!citySnapshot.exists || citySnapshot.data()?.status !== 'active') return { state: 'missing_city' };
  let city = citySnapshot.data();
  if (!force && city.destinationImage?.source?.type === 'unsplash') {
    return { state: 'ready', unchanged: true };
  }
  const jobRef = destinationJobRef(db, countryId, cityId);
  let job = (await jobRef.get()).data() || {};
  const attempts = Number(job?.imageSync?.attempts || 0) + 1;
  const canonicalQuery = destinationQuery(city, countrySnapshot.data());
  const query = String(canonicalQuery || job?.imageSync?.query || '').trim();
  if (!query) {
    const fallback = await selectRecommendationFallback(db, countryId, cityId).catch(() => null);
    if (fallback && !sameDestinationImage(city.destinationImage, fallback)) {
      await cityRef.update(destinationImageWritePatch(admin, fallback));
    }
    await jobRef.set({
      countryId,
      cityId,
      imageSync: {
        state: fallback ? 'ready' : 'retry',
        attempts,
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(fallback ? {} : { nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)) }),
        lastErrorCode: fallback ? null : 'missing_google_cache',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { state: fallback ? 'ready' : 'retry', image: fallback || null };
  }
  try {
    const candidate = await resolveDestinationImageCandidate({
      db,
      city,
      country: countrySnapshot.exists ? countrySnapshot.data() : null,
      countryId,
      cityId,
      unsplashKey,
      fetchImpl,
      query,
    });
    if (candidate.image?.source?.type === 'unsplash') {
      await trackUnsplashDownload({
        downloadLocation: candidate.downloadLocation,
        accessKey: unsplashKey,
        fetchImpl,
      });
    }
    if (!sameDestinationImage(city.destinationImage, candidate.image) || force) {
      await cityRef.update(destinationImageWritePatch(admin, candidate.image));
    }
    await jobRef.set({
      countryId, cityId,
      imageSync: { state: candidate.state, attempts, query, unsplashOutcome: candidate.image?.source?.type === 'unsplash' ? 'match' : 'no_match', lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return candidate;
  } catch (error) {
    const state = attempts >= MAX_IMAGE_SYNC_ATTEMPTS ? 'failed' : 'retry';
    if (state === 'failed') {
      const fallback = await selectRecommendationFallback(db, countryId, cityId).catch(() => null);
      if (fallback) {
        await cityRef.update(destinationImageWritePatch(admin, fallback));
        await jobRef.set({ imageSync: { state: 'ready', attempts, query, unsplashOutcome: 'provider_failed', lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
        return { state: 'ready', image: fallback, providerError: error };
      }
    }
    await jobRef.set({
      countryId, cityId,
      imageSync: { state, attempts, query, lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(), ...(state === 'retry' ? { nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)) } : {}), lastErrorCode: String(error?.status || error?.code || 'unsplash_error') },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { state, error };
  }
}

async function refreshRecommendationFallbackForDestination({
  admin,
  countryId,
  cityId,
  force = false,
}) {
  if (!countryId || !cityId) return { state: 'invalid_destination' };
  const db = admin.firestore();
  const cityRef = db.doc(`countries/${countryId}/cities/${cityId}`);
  const citySnapshot = await cityRef.get();
  if (!citySnapshot.exists) return { state: 'missing_city' };
  const city = citySnapshot.data();
  if (city.destinationImage?.source?.type === 'unsplash') return { state: 'ready', unchanged: true };
  const image = await selectRecommendationFallback(db, countryId, cityId);
  const state = image ? 'ready' : 'no_match';
  if (sameDestinationImage(city.destinationImage, image)) {
    return { state, unchanged: true, image };
  }
  await cityRef.update(destinationImageWritePatch(admin, image));
  await destinationJobRef(db, countryId, cityId).set({
    countryId, cityId,
    imageSync: { state, lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { state, image };
}

function destinationKey(value) {
  const countryId = value?.destination?.countryId;
  const cityId = value?.destination?.cityId;
  return countryId && cityId ? `${countryId}\n${cityId}` : null;
}

async function syncDestinationImagesForRecommendationChange({ admin, before, after }) {
  const destinations = new Map();
  for (const value of [before, after]) {
    const key = destinationKey(value);
    if (key) destinations.set(key, value.destination);
  }
  const results = [];
  for (const destination of destinations.values()) {
    const result = await refreshRecommendationFallbackForDestination({
      admin,
      countryId: destination.countryId,
      cityId: destination.cityId,
    });
    results.push({ destination, result });
  }
  return results;
}

async function repairPendingDestinationImages({
  admin,
  unsplashKey,
  fetchImpl = global.fetch,
  limit = 25,
}) {
  const snapshot = await admin.firestore().collection('system').doc('runtime').collection('destinationJobs')
    .where('imageSync.state', 'in', ['pending', 'retry'])
    .limit(limit)
    .get();
  const results = [];
  for (const citySnapshot of snapshot.docs) {
    const countryId = citySnapshot.data()?.countryId;
    const cityId = citySnapshot.data()?.cityId;
    if (!countryId || !cityId) continue;
    results.push(await resolveAndPersistDestinationImage({
      admin,
      countryId,
      cityId,
      unsplashKey,
      fetchImpl,
      force: true,
    }));
  }
  return results;
}

module.exports = {
  MAX_IMAGE_SYNC_ATTEMPTS,
  IDENTITY_STRATEGY_VERSION,
  buildUnsplashDestinationImage,
  destinationImageWritePatch,
  recommendationMediaImage,
  refreshRecommendationFallbackForDestination,
  repairPendingDestinationImages,
  resolveAndPersistDestinationIdentity,
  resolveAndPersistDestinationImage,
  resolveDestinationImageCandidate,
  destinationJobRef,
  destinationQuery,
  searchUnsplash,
  selectMostPopularRecommendationImage,
  selectRecommendationFallback,
  syncDestinationImagesForRecommendationChange,
  trackUnsplashDownload,
};
