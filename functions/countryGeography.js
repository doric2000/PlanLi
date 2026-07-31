const geography = require('./geo/countryBoundaries.v5.1.1.json');
const { countries: localCountries } = require('countries-list');

const EARTH_RADIUS_KM = 6371.0088;
const VALID_RESOLUTION_SOURCES = new Set([
  'israel-policy',
  'place-details',
  'city-place',
  'google-reverse',
  'local-boundary',
  'nearest-country',
]);

function normalizeCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

function longitudeDelta(value, origin) {
  let delta = value - origin;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function pointOnSegment(point, start, end, epsilon = 1e-10) {
  const px = 0;
  const py = point.lat;
  const ax = longitudeDelta(start[0], point.lng);
  const ay = start[1];
  const bx = longitudeDelta(end[0], point.lng);
  const by = end[1];
  const squaredLength = (bx - ax) ** 2 + (by - ay) ** 2;
  if (squaredLength <= epsilon) {
    return (px - ax) ** 2 + (py - ay) ** 2 <= epsilon;
  }
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < -epsilon) return false;
  return dot <= squaredLength + epsilon;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;

    const currentX = longitudeDelta(currentPoint[0], point.lng);
    const previousX = longitudeDelta(previousPoint[0], point.lng);
    const currentY = currentPoint[1];
    const previousY = previousPoint[1];
    const crossesLatitude =
      (currentY > point.lat) !== (previousY > point.lat);
    if (!crossesLatitude) continue;
    const crossingX =
      previousX +
      ((point.lat - previousY) * (currentX - previousX)) /
        (currentY - previousY);
    if (crossingX >= 0) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoordinates(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function pointInGeometry(point, geometry) {
  if (geometry?.type === 'Polygon') {
    return pointInPolygonCoordinates(point, geometry.coordinates);
  }
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) =>
      pointInPolygonCoordinates(point, polygon)
    );
  }
  return false;
}

function segmentDistanceKm(point, start, end) {
  const latitudeScale = Math.PI / 180;
  const longitudeScale =
    Math.cos(point.lat * latitudeScale) * latitudeScale;
  const ax = longitudeDelta(start[0], point.lng) * longitudeScale;
  const ay = (start[1] - point.lat) * latitudeScale;
  const bx = longitudeDelta(end[0], point.lng) * longitudeScale;
  const by = (end[1] - point.lat) * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const projection =
    denominator === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator));
  const closestX = ax + projection * dx;
  const closestY = ay + projection * dy;
  return Math.hypot(closestX, closestY) * EARTH_RADIUS_KM;
}

function ringDistanceKm(point, ring) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < ring.length; index += 1) {
    minimum = Math.min(
      minimum,
      segmentDistanceKm(point, ring[index - 1], ring[index])
    );
  }
  return minimum;
}

function geometryDistanceKm(point, geometry) {
  if (pointInGeometry(point, geometry)) return 0;
  const polygons =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  let minimum = Number.POSITIVE_INFINITY;
  polygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      minimum = Math.min(minimum, ringDistanceKm(point, ring));
    });
  });
  return minimum;
}

function pointDistanceKm(point, coordinates) {
  const [lng, lat] = coordinates;
  const latitudeDelta = ((lat - point.lat) * Math.PI) / 180;
  const longitudeDeltaRadians =
    (longitudeDelta(lng, point.lng) * Math.PI) / 180;
  const startLatitude = (point.lat * Math.PI) / 180;
  const endLatitude = (lat * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDeltaRadians / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function getHebrewCountryName(countryCode) {
  const normalized = String(countryCode || '').toUpperCase();
  const feature = geography.countries.find((entry) => entry.code === normalized);
  if (feature?.nameHe) return feature.nameHe;
  const tiny = geography.tinyCountries.find((entry) => entry.code === normalized);
  if (tiny?.nameHe) return tiny.nameHe;
  return localCountries[normalized]?.native || localCountries[normalized]?.name || normalized;
}

function resolveIsraelPolicy(coordinates) {
  const point = normalizeCoordinates(coordinates);
  if (!point) return null;
  const policyArea = geography.israelPolicyAreas.find((feature) =>
    pointInGeometry(point, feature.geometry)
  );
  if (!policyArea) return null;
  return {
    countryCode: 'IL',
    countryName: getHebrewCountryName('IL'),
    resolutionSource: 'israel-policy',
    policyArea: policyArea.name,
    distanceKm: 0,
  };
}

function compareCandidate(left, right) {
  if (Math.abs(left.distanceKm - right.distanceKm) > 1e-9) {
    return left.distanceKm - right.distanceKm;
  }
  return left.countryCode.localeCompare(right.countryCode);
}

function resolveLocalCountry(coordinates) {
  const point = normalizeCoordinates(coordinates);
  if (!point) return null;

  const containing = geography.countries
    .filter((feature) => pointInGeometry(point, feature.geometry))
    .map((feature) => ({
      countryCode: feature.code,
      countryName: getHebrewCountryName(feature.code),
      resolutionSource: 'local-boundary',
      distanceKm: 0,
    }))
    .sort(compareCandidate);
  if (containing.length > 0) return containing[0];

  const polygonCandidates = geography.countries.map((feature) => ({
    countryCode: feature.code,
    countryName: getHebrewCountryName(feature.code),
    resolutionSource: 'nearest-country',
    distanceKm: geometryDistanceKm(point, feature.geometry),
  }));
  const tinyCountryCandidates = geography.tinyCountries.map((feature) => ({
    countryCode: feature.code,
    countryName: getHebrewCountryName(feature.code),
    resolutionSource: 'nearest-country',
    distanceKm: pointDistanceKm(point, feature.coordinates),
  }));
  return [...polygonCandidates, ...tinyCountryCandidates]
    .filter((candidate) => Number.isFinite(candidate.distanceKm))
    .sort(compareCandidate)[0] || null;
}

function validateCountryGeography() {
  if (geography.version !== '5.1.1') {
    throw new Error(`Unexpected Natural Earth version: ${geography.version}`);
  }
  const invalidFeatures = [
    ...geography.countries,
    ...geography.tinyCountries,
  ].filter(
    (feature) =>
      !/^[A-Z]{2}$/.test(feature.code) || !localCountries[feature.code]
  );
  if (invalidFeatures.length > 0) {
    throw new Error(
      `Unsupported geography country codes: ${[
        ...new Set(invalidFeatures.map((feature) => feature.code)),
      ].join(', ')}`
    );
  }
  const requiredPolicyAreas = [
    'West Bank',
    'East Jerusalem',
    'Golan Heights',
  ];
  const availablePolicyAreas = new Set(
    geography.israelPolicyAreas.map((feature) => feature.name)
  );
  const missingPolicyAreas = requiredPolicyAreas.filter(
    (name) => !availablePolicyAreas.has(name)
  );
  if (missingPolicyAreas.length > 0) {
    throw new Error(
      `Missing Israel policy geography: ${missingPolicyAreas.join(', ')}`
    );
  }
  return true;
}

validateCountryGeography();

module.exports = {
  VALID_RESOLUTION_SOURCES,
  geometryDistanceKm,
  getHebrewCountryName,
  normalizeCoordinates,
  pointInGeometry,
  resolveIsraelPolicy,
  resolveLocalCountry,
  validateCountryGeography,
};
