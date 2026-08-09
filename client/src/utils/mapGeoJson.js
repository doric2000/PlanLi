const EMPTY_FEATURE_COLLECTION = Object.freeze({ type: 'FeatureCollection', features: [] });

export function featureCollection(features = []) {
  return { type: 'FeatureCollection', features: features.filter(Boolean) };
}

export function pointFeature(coordinates, properties = {}, id) {
  const lng = Number(coordinates?.lng ?? coordinates?.longitude ?? coordinates?.[0]);
  const lat = Number(coordinates?.lat ?? coordinates?.latitude ?? coordinates?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    type: 'Feature',
    ...(id != null ? { id } : {}),
    properties,
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

export function lineFeature(coordinates = [], properties = {}) {
  const points = coordinates
    .map((entry) => pointFeature(entry))
    .filter(Boolean)
    .map((entry) => entry.geometry.coordinates);
  if (points.length < 2) return null;
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: points },
  };
}

export function accuracyCircleFeature(location, steps = 48) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const accuracy = Math.max(0, Number(location?.accuracy) || 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !accuracy) return null;
  const earthRadius = 6_371_000;
  const angularDistance = accuracy / earthRadius;
  const latitude = lat * Math.PI / 180;
  const longitude = lng * Math.PI / 180;
  const ring = [];
  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const nextLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const nextLongitude = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude)
    );
    ring.push([nextLongitude * 180 / Math.PI, nextLatitude * 180 / Math.PI]);
  }
  return {
    type: 'Feature',
    properties: { accuracy },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export function userLocationGeoJson(location) {
  if (!location) return EMPTY_FEATURE_COLLECTION;
  return featureCollection([
    accuracyCircleFeature(location),
    pointFeature(location, { kind: 'user' }, 'user-location'),
  ]);
}

export function viewportFromBounds(bounds, zoom) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return null;
  const [rawWest, south, rawEast, north] = bounds.map(Number);
  const numericZoom = Number(zoom);
  if (![rawWest, south, rawEast, north, numericZoom].every(Number.isFinite)) return null;
  const normalizeLongitude = (value) => ((value + 180) % 360 + 360) % 360 - 180;
  const west = normalizeLongitude(rawWest);
  const east = normalizeLongitude(rawEast);
  return { north, south, east, west, zoom: numericZoom };
}

export { EMPTY_FEATURE_COLLECTION };
