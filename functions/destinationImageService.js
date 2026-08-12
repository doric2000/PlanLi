const { FieldPath } = require('firebase-admin/firestore');
const { cityName, distanceKm } = require('./destinationIdentityService');
const { resolveWikimediaDestinationImage } = require('./wikimediaDestinationImageService');

const MAX_IMAGE_SYNC_ATTEMPTS = 6;
const IDENTITY_STRATEGY_VERSION = 3;
const RECOMMENDATION_PAGE_SIZE = 100;
const UTM_SOURCE = 'planli';
const UTM_MEDIUM = 'referral';
const UNSPLASH_HOURLY_REQUEST_BUDGET = 45;
const IMAGE_VALIDATION_VERSION = 1;
const UNSPLASH_SEARCH_RESULTS = 8;
const UNSPLASH_MAX_DETAIL_CHECKS = 5;

const DESTINATION_RADIUS_KM = Object.freeze({
  village: 10,
  city: 25,
  town: 25,
  lake: 60,
  island: 60,
  natural_feature: 60,
  region: 150,
});

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

function buildUnsplashDestinationImage(photo, query, { rank = 1, validation = null } = {}) {
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
      strategy: validation ? 'verified_relevant' : 'top_relevant',
      query,
      rank,
      ...(validation ? { validation } : {}),
    },
  };
}

function normalizeImageText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u0591-\u05C7]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, '')
    .replace(/[^a-z0-9\u05d0-\u05ea]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsExactPhrase(value, expected) {
  const text = normalizeImageText(value);
  const phrase = normalizeImageText(expected);
  if (!text || !phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

function destinationImageContext(city, country) {
  const googleNames = city?.googleCache?.names || {};
  const identityNames = city?.identity?.names || {};
  const countryNames = country?.names || {};
  const countryCode = String(city?.googleCache?.countryCode || city?.identity?.countryCode || country?.code || '')
    .trim().toUpperCase();
  const intlCountry = /^[A-Z]{2}$/.test(countryCode)
    ? new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode)
    : null;
  return {
    destinationNames: [...new Set([googleNames.en, identityNames.en, cityName(city)].filter(Boolean))],
    countryNames: [...new Set([countryNames.en, city?.identity?.countryNames?.en, intlCountry].filter(Boolean))],
    coordinates: city?.googleCache?.coordinates || city?.identity?.coordinates || city?.coordinates || null,
    viewport: city?.googleCache?.viewport || null,
    destinationType: city?.destinationType || 'city',
  };
}

function photoCoordinates(photo) {
  const rawLat = photo?.location?.position?.latitude;
  const rawLng = photo?.location?.position?.longitude;
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function maximumDestinationDistanceKm(context) {
  const configured = DESTINATION_RADIUS_KM[context.destinationType] || DESTINATION_RADIUS_KM.city;
  const center = context.coordinates;
  const northeast = context.viewport?.northeast;
  const southwest = context.viewport?.southwest;
  if (!center || !northeast || !southwest) return configured;
  const viewportDistance = Math.max(distanceKm(center, northeast), distanceKm(center, southwest));
  return Number.isFinite(viewportDistance) && viewportDistance > 0
    ? Math.min(configured, viewportDistance)
    : configured;
}

function photoTextValues(photo) {
  return [
    photo?.location?.name,
    photo?.location?.city,
    photo?.location?.country,
    photo?.description,
    photo?.alt_description,
    ...(Array.isArray(photo?.tags) ? photo.tags.map((tag) => tag?.title || tag?.source?.title) : []),
  ].filter(Boolean);
}

function validateUnsplashPhoto(photo, context) {
  const destinationMatches = photoTextValues(photo).some((value) =>
    context.destinationNames.some((name) => containsExactPhrase(value, name))
  );
  const explicitCountry = String(photo?.location?.country || '').trim();
  const countryMatches = context.countryNames.some((name) => containsExactPhrase(explicitCountry, name));
  if (explicitCountry && !countryMatches) return { valid: false, reason: 'conflicting_country' };

  const coordinates = photoCoordinates(photo);
  if (coordinates && context.coordinates) {
    const measuredDistance = distanceKm(context.coordinates, coordinates);
    const roundedDistance = Number(measuredDistance.toFixed(1));
    if (measuredDistance > maximumDestinationDistanceKm(context)) {
      return { valid: false, reason: 'outside_destination', distanceKm: roundedDistance };
    }
    const explicitCity = String(photo?.location?.city || '').trim();
    const cityMatches = context.destinationNames.some((name) => containsExactPhrase(explicitCity, name));
    if (explicitCity && !cityMatches && measuredDistance > 5) {
      return { valid: false, reason: 'conflicting_city', distanceKm: roundedDistance };
    }
    return {
      valid: true,
      score: destinationMatches ? 3 : 2,
      validation: {
        version: IMAGE_VALIDATION_VERSION,
        status: 'geo_verified',
        method: 'coordinates',
        distanceKm: roundedDistance,
      },
    };
  }

  const countryTextMatches = photoTextValues(photo).some((value) =>
    context.countryNames.some((name) => containsExactPhrase(value, name))
  );
  const explicitCity = String(photo?.location?.city || '').trim();
  if (explicitCity && !context.destinationNames.some((name) => containsExactPhrase(explicitCity, name))) {
    return { valid: false, reason: 'conflicting_city' };
  }
  if (destinationMatches && countryTextMatches) {
    return {
      valid: true,
      score: 1,
      validation: {
        version: IMAGE_VALIDATION_VERSION,
        status: 'text_verified',
        method: 'destination_country_text',
        distanceKm: 0,
      },
    };
  }
  return { valid: false, reason: 'unverified_metadata' };
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

async function searchUnsplash({ query, accessKey, fetchImpl = global.fetch, onRequest = async () => {} }) {
  if (!accessKey) throw new Error('UNSPLASH_ACCESS_KEY is not configured.');
  if (!query) return { photos: [], total: 0, rateLimit: null };
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('order_by', 'relevant');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');
  url.searchParams.set('per_page', String(UNSPLASH_SEARCH_RESULTS));
  await onRequest();
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
  const rateLimitValue = (name) => {
    const value = response.headers?.get?.(name);
    return value === null || value === undefined || value === '' ? null : Number(value);
  };
  return {
    photos: Array.isArray(payload?.results) ? payload.results.slice(0, UNSPLASH_SEARCH_RESULTS) : [],
    total: Number(payload?.total || 0),
    rateLimit: {
      limit: rateLimitValue('x-ratelimit-limit'),
      remaining: rateLimitValue('x-ratelimit-remaining'),
    },
  };
}

async function fetchUnsplashPhoto({ photoId, accessKey, fetchImpl = global.fetch, onRequest = async () => {} }) {
  if (!accessKey) throw new Error('UNSPLASH_ACCESS_KEY is not configured.');
  const url = new URL(`https://api.unsplash.com/photos/${encodeURIComponent(photoId)}`);
  await onRequest();
  const response = await fetchImpl(url, {
    headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
  });
  if (!response.ok) {
    const error = new Error(`Unsplash photo lookup failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function trackUnsplashDownload({ downloadLocation, accessKey, fetchImpl = global.fetch, onRequest = async () => {} }) {
  if (!downloadLocation) return;
  if (!isHttpsUrl(downloadLocation)) throw new Error('Invalid Unsplash download tracking URL.');
  await onRequest();
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
  maxDetailChecks = UNSPLASH_MAX_DETAIL_CHECKS,
  excludedPhotoIds = [],
  onRequest = async () => {},
  resolveWikimediaImage = resolveWikimediaDestinationImage,
}) {
  const fallbackImage = async (unsplashOutcome) => {
    const recommendation = await selectRecommendationFallback(db, countryId, cityId);
    if (recommendation) {
      return {
        image: recommendation,
        downloadLocation: null,
        rateLimit: null,
        state: 'ready',
        outcome: 'match_recommendation',
        unsplashOutcome,
      };
    }
    const wikimedia = await resolveWikimediaImage({ city, country, fetchImpl });
    return {
      image: wikimedia,
      downloadLocation: null,
      rateLimit: null,
      state: wikimedia ? 'ready' : 'no_match',
      outcome: wikimedia ? 'match_wikimedia' : unsplashOutcome,
      unsplashOutcome,
    };
  };
  if (!query) {
    return fallbackImage('missing_query');
  }
  const unsplash = await searchUnsplash({ query, accessKey: unsplashKey, fetchImpl, onRequest });
  if (!unsplash.photos.length) {
    const fallback = await fallbackImage('zero_results');
    return { ...fallback, rateLimit: unsplash.rateLimit };
  }
  const context = destinationImageContext(city, country);
  const excluded = new Set(excludedPhotoIds);
  const verified = [];
  let checked = 0;
  for (let index = 0; index < unsplash.photos.length && checked < maxDetailChecks; index += 1) {
    const summary = unsplash.photos[index];
    if (!summary?.id || excluded.has(summary.id)) continue;
    checked += 1;
    const photo = await fetchUnsplashPhoto({ photoId: summary.id, accessKey: unsplashKey, fetchImpl, onRequest });
    const result = validateUnsplashPhoto(photo, context);
    if (!result.valid) {
      console.info('Rejected Unsplash destination image.', {
        photoId: summary.id,
        reason: result.reason,
        ...(result.distanceKm === undefined ? {} : { distanceKm: result.distanceKm }),
      });
      continue;
    }
    verified.push({ photo, rank: index + 1, ...result });
  }
  verified.sort((left, right) => right.score - left.score || left.rank - right.rank);
  if (verified.length) {
    const selected = verified[0];
    const image = buildUnsplashDestinationImage(selected.photo, query, {
      rank: selected.rank,
      validation: selected.validation,
    });
    if (!image) throw new Error('Unsplash returned an incomplete photo result.');
    return {
      image,
      downloadLocation: selected.photo?.links?.download_location || null,
      rateLimit: unsplash.rateLimit,
      state: 'ready',
      outcome: selected.validation.status === 'geo_verified' ? 'match_geo' : 'match_text',
    };
  }
  const fallback = await fallbackImage('no_verified_match');
  return { ...fallback, rateLimit: unsplash.rateLimit };
}

function sameDestinationImage(left, right) {
  return left?.source?.type === right?.source?.type &&
    left?.source?.providerPhotoId === right?.source?.providerPhotoId &&
    left?.source?.recommendationId === right?.source?.recommendationId &&
    left?.source?.assetId === right?.source?.assetId &&
    left?.source?.fileName === right?.source?.fileName &&
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

async function consumeUnsplashBudget(db, { units = 1, now = Date.now() } = {}) {
  const ref = db.doc('system/runtime/providerGlobalLimits/unsplash_hour');
  await db.runTransaction(async (transaction) => {
    const previous = (await transaction.get(ref)).data() || {};
    const active = now - Number(previous.windowStartedAtMs || 0) < 60 * 60 * 1000;
    const used = active ? Number(previous.used || 0) : 0;
    if (used + units > UNSPLASH_HOURLY_REQUEST_BUDGET) {
      const error = new Error('Unsplash request budget is temporarily exhausted.');
      error.status = 429;
      throw error;
    }
    transaction.set(ref, {
      provider: 'unsplash',
      used: used + units,
      windowStartedAtMs: active ? previous.windowStartedAtMs : now,
      expireAt: new Date(now + 2 * 60 * 60 * 1000),
      updatedAt: new Date(now),
    });
  });
}

async function resolveAndPersistDestinationIdentity({ admin, countryId, cityId, fetchImpl = global.fetch }) {
  const db = admin.firestore();
  const cityRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
  const countryRef = db.doc(`countries/${countryId}`);
  const jobRef = destinationJobRef(db, countryId, cityId);
  const [citySnapshot, countrySnapshot] = await Promise.all([cityRef.get(), countryRef.get()]);
  if (!citySnapshot.exists || !countrySnapshot.exists) return { state: 'missing_city' };
  const city = citySnapshot.data() || {};
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const ready = Boolean(city.googleCache?.names?.en && city.googleCache?.names?.he);
  await jobRef.set({
    countryId, cityId,
    identitySync: {
      state: ready ? 'ready' : 'needs_review',
      strategyVersion: IDENTITY_STRATEGY_VERSION,
      attempts: 0,
      lastAttemptAt: timestamp,
      ...(ready ? {} : { lastErrorCode: 'missing_google_cache' }),
    },
    updatedAt: timestamp,
  }, { merge: true });
  return { state: ready ? 'ready' : 'needs_review', identity: ready ? city.googleCache : null };
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
  const cityRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
  const countryRef = db.doc(`countries/${countryId}`);
  const [citySnapshot, countrySnapshot] = await Promise.all([cityRef.get(), countryRef.get()]);
  if (!citySnapshot.exists || citySnapshot.data()?.status !== 'active') return { state: 'missing_city' };
  let city = citySnapshot.data();
  const currentValidationVersion = Number(city.destinationImage?.selection?.validation?.version || 0);
  if (['unsplash', 'wikimedia'].includes(city.destinationImage?.source?.type) &&
      currentValidationVersion >= IMAGE_VALIDATION_VERSION) {
    return { state: 'ready', unchanged: true };
  }
  const jobRef = destinationJobRef(db, countryId, cityId);
  let job = (await jobRef.get()).data() || {};
  const attempts = Number(job?.imageSync?.attempts || 0) + 1;
  const canonicalQuery = destinationQuery(city, countrySnapshot.data());
  const query = String(canonicalQuery || job?.imageSync?.query || '').trim();
  if (!query) {
    await jobRef.set({
      countryId,
      cityId,
      imageSync: {
        state: 'retry',
        attempts,
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
        lastErrorCode: 'missing_google_cache',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { state: 'retry', image: city.destinationImage || null };
  }
  try {
    const country = countrySnapshot.exists ? countrySnapshot.data() : null;
    const onRequest = () => consumeUnsplashBudget(db);
    const currentPhotoId = city.destinationImage?.source?.type === 'unsplash'
      ? city.destinationImage.source.providerPhotoId
      : null;
    let candidate = null;
    if (currentPhotoId) {
      try {
        const currentPhoto = await fetchUnsplashPhoto({
          photoId: currentPhotoId,
          accessKey: unsplashKey,
          fetchImpl,
          onRequest,
        });
        const currentResult = validateUnsplashPhoto(currentPhoto, destinationImageContext(city, country));
        if (currentResult.valid) {
          const image = buildUnsplashDestinationImage(currentPhoto, query, {
            rank: Number(city.destinationImage?.selection?.rank || 1),
            validation: currentResult.validation,
          });
          if (!image) throw new Error('Unsplash returned an incomplete photo result.');
          candidate = {
            image,
            downloadLocation: null,
            rateLimit: null,
            state: 'ready',
            outcome: currentResult.validation.status === 'geo_verified' ? 'match_geo' : 'match_text',
          };
        } else {
          console.info('Rejected existing Unsplash destination image.', {
            countryId,
            cityId,
            photoId: currentPhotoId,
            reason: currentResult.reason,
            ...(currentResult.distanceKm === undefined ? {} : { distanceKm: currentResult.distanceKm }),
          });
        }
      } catch (error) {
        if (Number(error?.status) !== 404) throw error;
        console.info('Existing Unsplash destination image no longer exists.', { countryId, cityId, photoId: currentPhotoId });
      }
    }
    if (!candidate) {
      candidate = await resolveDestinationImageCandidate({
        db,
        city,
        country,
        countryId,
        cityId,
        unsplashKey,
        fetchImpl,
        query,
        maxDetailChecks: currentPhotoId ? UNSPLASH_MAX_DETAIL_CHECKS - 1 : UNSPLASH_MAX_DETAIL_CHECKS,
        excludedPhotoIds: currentPhotoId ? [currentPhotoId] : [],
        onRequest,
      });
    }
    if (candidate.image?.source?.type === 'unsplash') {
      await trackUnsplashDownload({
        downloadLocation: candidate.downloadLocation,
        accessKey: unsplashKey,
        fetchImpl,
        onRequest,
      });
    }
    if (!sameDestinationImage(city.destinationImage, candidate.image) || force) {
      await cityRef.update(destinationImageWritePatch(admin, candidate.image));
    }
    await jobRef.set({
      countryId, cityId,
      imageSync: {
        state: candidate.state,
        attempts,
        query,
        providerOutcome: candidate.outcome,
        unsplashOutcome: candidate.unsplashOutcome || candidate.outcome,
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return candidate;
  } catch (error) {
    const state = attempts >= MAX_IMAGE_SYNC_ATTEMPTS ? 'failed' : 'retry';
    await jobRef.set({
      countryId, cityId,
      imageSync: { state, attempts, query, unsplashOutcome: 'provider_error', lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(), ...(state === 'retry' ? { nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)) } : {}), lastErrorCode: String(error?.status || error?.code || 'unsplash_error') },
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
  const cityRef = db.doc(`countries/${countryId}/destinations/${cityId}`);
  const citySnapshot = await cityRef.get();
  if (!citySnapshot.exists) return { state: 'missing_city' };
  const city = citySnapshot.data();
  if (['unsplash', 'wikimedia'].includes(city.destinationImage?.source?.type)) {
    return { state: 'ready', unchanged: true };
  }
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
    .limit(Math.min(100, limit * 5))
    .get();
  const results = [];
  for (const citySnapshot of snapshot.docs) {
    const job = citySnapshot.data() || {};
    const countryId = job.countryId;
    const cityId = job.cityId;
    if (!countryId || !cityId) continue;
    const nextAttemptAt = timestampMs(job.imageSync?.nextAttemptAt);
    if (job.imageSync?.state === 'retry' && nextAttemptAt > Date.now()) continue;
    results.push(await resolveAndPersistDestinationImage({
      admin,
      countryId,
      cityId,
      unsplashKey,
      fetchImpl,
      force: true,
    }));
    if (results.length >= limit) break;
  }
  return results;
}

async function auditUnvalidatedDestinationImages({
  admin,
  unsplashKey,
  fetchImpl = global.fetch,
  limit = 5,
  scanLimit = 100,
  resolveImage = resolveAndPersistDestinationImage,
}) {
  const db = admin.firestore();
  const stateRef = db.doc(`system/runtime/destinationImageAudits/policy_${IMAGE_VALIDATION_VERSION}`);
  const stateSnapshot = await stateRef.get();
  const state = stateSnapshot.data() || {};
  if (Number(state.completedVersion || 0) >= IMAGE_VALIDATION_VERSION) {
    return { audited: 0, scanned: 0, complete: true };
  }

  let query = db.collection('destinationCatalog')
    .orderBy(FieldPath.documentId())
    .limit(Math.max(1, Math.min(500, scanLimit)));
  if (state.cursor) query = query.startAfter(state.cursor);
  const snapshot = await query.get();
  let audited = 0;
  let scanned = 0;
  let cursor = state.cursor || null;
  let pausedForRetry = false;
  let stoppedAtLimit = false;

  for (const catalogDocument of snapshot.docs) {
    if (audited >= limit) {
      stoppedAtLimit = true;
      break;
    }
    scanned += 1;
    const catalog = catalogDocument.data() || {};
    const destinationRef = catalog.countryId && catalog.cityId
      ? db.doc(`countries/${catalog.countryId}/destinations/${catalog.cityId}`)
      : null;
    const destinationSnapshot = destinationRef ? await destinationRef.get() : null;
    const destination = destinationSnapshot?.exists ? destinationSnapshot.data() : null;
    const needsAudit = destination?.status === 'active' &&
      destination?.destinationImage?.source?.type === 'unsplash' &&
      Number(destination?.destinationImage?.selection?.validation?.version || 0) < IMAGE_VALIDATION_VERSION;
    if (needsAudit) {
      const result = await resolveImage({
        admin,
        countryId: catalog.countryId,
        cityId: catalog.cityId,
        unsplashKey,
        fetchImpl,
        force: true,
      });
      if (result.state === 'retry') {
        pausedForRetry = true;
        break;
      }
      audited += 1;
    }
    cursor = catalogDocument.id;
    await stateRef.set({
      policyVersion: IMAGE_VALIDATION_VERSION,
      cursor,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const complete = !pausedForRetry && !stoppedAtLimit && snapshot.size < scanLimit;
  if (complete) {
    await stateRef.set({
      policyVersion: IMAGE_VALIDATION_VERSION,
      completedVersion: IMAGE_VALIDATION_VERSION,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      cursor: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return { audited, scanned, complete, pausedForRetry };
}

module.exports = {
  MAX_IMAGE_SYNC_ATTEMPTS,
  IDENTITY_STRATEGY_VERSION,
  IMAGE_VALIDATION_VERSION,
  auditUnvalidatedDestinationImages,
  buildUnsplashDestinationImage,
  consumeUnsplashBudget,
  destinationImageWritePatch,
  recommendationMediaImage,
  refreshRecommendationFallbackForDestination,
  repairPendingDestinationImages,
  resolveAndPersistDestinationIdentity,
  resolveAndPersistDestinationImage,
  resolveDestinationImageCandidate,
  destinationJobRef,
  destinationQuery,
  destinationImageContext,
  fetchUnsplashPhoto,
  maximumDestinationDistanceKm,
  normalizeImageText,
  searchUnsplash,
  selectMostPopularRecommendationImage,
  selectRecommendationFallback,
  syncDestinationImagesForRecommendationChange,
  trackUnsplashDownload,
  validateUnsplashPhoto,
};
