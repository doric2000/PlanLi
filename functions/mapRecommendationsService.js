const { HttpsError } = require('firebase-functions/v2/https');
const { distanceBetween, geohashQueryBounds } = require('geofire-common');

const { matchesDestinations, parseSearchQuery, searchRelevance } = require('./discoverySearch');
const { cleanDestinations, cleanFilters, matchesFilters } = require('./personalizationService');
const { normalizeMapCoordinates } = require('./mapLocation');

const MIN_MAP_ZOOM = 4;
const MAX_MAP_RESULTS = 200;
const MAX_QUERY_RESULTS_PER_BOUND = MAX_MAP_RESULTS + 1;

function assert(condition, code, message) {
  if (!condition) throw new HttpsError(code, message);
}

function normalizeLongitude(value) {
  const wrapped = ((Number(value) + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function normalizeViewport(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'viewport is invalid.');
  const viewport = {
    north: Number(value.north),
    south: Number(value.south),
    east: Number(value.east),
    west: Number(value.west),
    zoom: Number(value.zoom),
  };
  assert(Object.values(viewport).every(Number.isFinite),
    'invalid-argument', 'viewport is invalid.');
  assert(viewport.north > viewport.south && viewport.north <= 90 && viewport.south >= -90,
    'invalid-argument', 'viewport latitude bounds are invalid.');
  assert(viewport.east >= -180 && viewport.east <= 180 &&
    viewport.west >= -180 && viewport.west <= 180,
  'invalid-argument', 'viewport longitude bounds are invalid.');
  assert(viewport.zoom >= 0 && viewport.zoom <= 24,
    'invalid-argument', 'viewport zoom is invalid.');
  return viewport;
}

function viewportCenter(viewport) {
  const latitude = (viewport.north + viewport.south) / 2;
  const east = viewport.east < viewport.west ? viewport.east + 360 : viewport.east;
  return [latitude, normalizeLongitude((viewport.west + east) / 2)];
}

function viewportContains(viewport, coordinatesValue) {
  const coordinates = normalizeMapCoordinates(coordinatesValue);
  if (!coordinates) return false;
  const withinLatitude = coordinates.lat >= viewport.south && coordinates.lat <= viewport.north;
  const withinLongitude = viewport.east >= viewport.west
    ? coordinates.lng >= viewport.west && coordinates.lng <= viewport.east
    : coordinates.lng >= viewport.west || coordinates.lng <= viewport.east;
  return withinLatitude && withinLongitude;
}

function getViewportGeohashBounds(viewport) {
  const center = viewportCenter(viewport);
  const cornerLongitudes = [viewport.west, viewport.east];
  const cornerLatitudes = [viewport.north, viewport.south];
  let radiusMeters = 1;
  cornerLatitudes.forEach((lat) => cornerLongitudes.forEach((lng) => {
    radiusMeters = Math.max(radiusMeters, distanceBetween(center, [lat, lng]) * 1000);
  }));
  return geohashQueryBounds(center, radiusMeters);
}

function compactMedia(asset) {
  if (!asset || typeof asset !== 'object') return null;
  const compactVariant = (variant) => {
    const descriptor = asset?.[variant];
    if (!descriptor?.url) return null;
    return {
      url: descriptor.url,
      ...(Number.isFinite(Number(descriptor.width)) ? { width: Number(descriptor.width) } : {}),
      ...(Number.isFinite(Number(descriptor.height)) ? { height: Number(descriptor.height) } : {}),
    };
  };
  const thumb = compactVariant('thumb');
  if (!thumb) return null;
  return {
    thumb,
    ...(asset.placeholder?.color ? { placeholder: { color: asset.placeholder.color } } : {}),
  };
}

function mapRecommendationPreview(item) {
  const coordinates = normalizeMapCoordinates(item?.mapLocation || item?.place?.coordinates);
  if (!coordinates || !item?.id) return null;
  const firstMedia = compactMedia(Array.isArray(item.media) ? item.media[0] : null);
  return {
    id: item.id,
    postId: item.id,
    title: typeof item.title === 'string' ? item.title : '',
    categoryId: item.categoryId || null,
    category: item.category || null,
    budget: item.budget || null,
    stats: { likeCount: Math.max(0, Number(item?.stats?.likeCount) || 0) },
    destination: {
      countryId: item?.destination?.countryId || null,
      cityId: item?.destination?.cityId || null,
      countryName: item?.destination?.countryName || null,
      cityName: item?.destination?.cityName || null,
    },
    place: {
      name: item?.place?.name || null,
      address: item?.place?.address || null,
      coordinates,
    },
    media: firstMedia ? [firstMedia] : [],
  };
}

function filterMapCandidates(candidates, { viewport, parsedQuery, destinations, filters }) {
  const byId = new Map();
  candidates.forEach((item) => {
    if (!item?.id || byId.has(item.id)) return;
    if (item.status !== 'active') return;
    if (!viewportContains(viewport, item.mapLocation || item?.place?.coordinates)) return;
    if (!matchesDestinations(item, destinations)) return;
    if (!matchesFilters(item, filters)) return;
    if (!searchRelevance(item, parsedQuery).matches) return;
    const preview = mapRecommendationPreview(item);
    if (preview) byId.set(item.id, preview);
  });
  return Array.from(byId.values());
}

async function queryMapCandidates(db, viewport) {
  const bounds = getViewportGeohashBounds(viewport);
  const snapshots = await Promise.all(bounds.map(([start, end]) => db
    .collection('recommendations')
    .where('status', '==', 'active')
    .orderBy('mapLocation.geohash')
    .startAt(start)
    .endAt(end)
    .limit(MAX_QUERY_RESULTS_PER_BOUND)
    .get()));
  return snapshots.flatMap((snapshot) => snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })));
}

async function getMapRecommendations({ admin, data }) {
  const viewport = normalizeViewport(data?.viewport);
  let parsedQuery;
  try {
    parsedQuery = parseSearchQuery(data?.query);
  } catch {
    throw new HttpsError('invalid-argument', 'query is invalid.');
  }
  const filters = cleanFilters(data?.filters || {});
  const { destinations } = cleanDestinations(data || {});
  if (viewport.zoom < MIN_MAP_ZOOM) {
    return { items: [], count: 0, truncated: false, zoomInRequired: true };
  }

  const candidates = await queryMapCandidates(admin.firestore(), viewport);
  const matching = filterMapCandidates(candidates, {
    viewport,
    parsedQuery,
    destinations,
    filters,
  });
  const truncated = matching.length > MAX_MAP_RESULTS;
  const items = matching.slice(0, MAX_MAP_RESULTS);
  return {
    items,
    count: items.length,
    truncated,
    zoomInRequired: truncated,
  };
}

module.exports = {
  MAX_MAP_RESULTS,
  MIN_MAP_ZOOM,
  filterMapCandidates,
  getMapRecommendations,
  getViewportGeohashBounds,
  mapRecommendationPreview,
  normalizeViewport,
  queryMapCandidates,
  viewportCenter,
  viewportContains,
};
