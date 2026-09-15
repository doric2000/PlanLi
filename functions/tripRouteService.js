const { HttpsError } = require('firebase-functions/v2/https');

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';
const MAX_ROUTE_POINTS_PER_REQUEST = 12;
const ROUTES_TIMEOUT_MS = 12_000;

function durationSeconds(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(value || ''));
  return match ? Math.max(0, Math.round(Number(match[1]))) : 0;
}

function routePoint(coordinates) {
  return {
    location: {
      latLng: {
        latitude: Number(coordinates.lat),
        longitude: Number(coordinates.lng),
      },
    },
  };
}

function chunkRoutePoints(points, maximum = MAX_ROUTE_POINTS_PER_REQUEST) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const chunks = [];
  let cursor = 0;
  while (cursor < points.length - 1) {
    const end = Math.min(points.length, cursor + maximum);
    chunks.push(points.slice(cursor, end));
    cursor = end - 1;
  }
  return chunks;
}

async function requestRouteChunk({
  accessToken,
  billingProject,
  fetchImpl = fetch,
  points,
  travelMode,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTES_TIMEOUT_MS);
  try {
    const response = await fetchImpl(ROUTES_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': ROUTES_FIELD_MASK,
        'X-Goog-User-Project': billingProject,
      },
      body: JSON.stringify({
        origin: routePoint(points[0].coordinates),
        destination: routePoint(points.at(-1).coordinates),
        intermediates: points.slice(1, -1).map((point) => routePoint(point.coordinates)),
        travelMode,
        ...(travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_UNAWARE' } : {}),
        polylineQuality: 'OVERVIEW',
        polylineEncoding: 'ENCODED_POLYLINE',
        languageCode: 'he',
        units: 'METRIC',
      }),
    });
    if (!response.ok) {
      const reason = response.status === 403
        ? 'ROUTES_API_NOT_AVAILABLE'
        : response.status === 429
          ? 'ROUTES_RATE_LIMITED'
          : 'ROUTES_PROVIDER_ERROR';
      throw new HttpsError(
        response.status === 429 ? 'resource-exhausted' : 'failed-precondition',
        'Live route calculation is temporarily unavailable.',
        { reason }
      );
    }
    const payload = await response.json();
    const route = payload?.routes?.[0];
    if (!route?.polyline?.encodedPolyline) {
      throw new HttpsError('not-found', 'No route was found for these stops.', {
        reason: 'ROUTE_NOT_FOUND',
      });
    }
    return {
      encodedPolyline: route.polyline.encodedPolyline,
      distanceMeters: Math.max(0, Number(route.distanceMeters) || 0),
      durationSeconds: durationSeconds(route.duration),
      fromStopId: points[0].stopId,
      toStopId: points.at(-1).stopId,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new HttpsError('deadline-exceeded', 'Live route calculation timed out.', {
        reason: 'ROUTES_TIMEOUT',
      });
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'Live route calculation is temporarily unavailable.', {
      reason: 'ROUTES_UNAVAILABLE',
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function computeRouteChunks(options) {
  const chunks = chunkRoutePoints(options.points);
  const segments = [];
  for (const points of chunks) {
    segments.push(await requestRouteChunk({ ...options, points }));
  }
  return {
    segments,
    totals: segments.reduce((total, segment) => ({
      distanceMeters: total.distanceMeters + segment.distanceMeters,
      durationSeconds: total.durationSeconds + segment.durationSeconds,
    }), { distanceMeters: 0, durationSeconds: 0 }),
  };
}

module.exports = {
  MAX_ROUTE_POINTS_PER_REQUEST,
  ROUTES_ENDPOINT,
  ROUTES_FIELD_MASK,
  ROUTES_TIMEOUT_MS,
  chunkRoutePoints,
  computeRouteChunks,
  durationSeconds,
  requestRouteChunk,
  routePoint,
};
