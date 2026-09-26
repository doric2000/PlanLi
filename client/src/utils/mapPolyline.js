// Google Maps iOS expands lineDashPattern into native GMSStyleSpans in meters
// (kGMSLengthRhumb), not screen pixels. Bound the work across ALL lines in a map.
export const MAP_DASH_SPAN_BUDGET = 512;
const EARTH_RADIUS_METERS = 6371009;
const radians = (degrees) => degrees * Math.PI / 180;

function pathLengthMeters(path) {
  let length = 0;
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    if (!Number.isFinite(point?.latitude) || Math.abs(point.latitude) >= 90
      || !Number.isFinite(point?.longitude) || Math.abs(point.longitude) > 180) return NaN;
    if (!index) continue;
    const previous = path[index - 1];
    const latitude = radians(previous.latitude);
    const nextLatitude = radians(point.latitude);
    const deltaLatitude = nextLatitude - latitude;
    let deltaLongitude = Math.abs(radians(point.longitude - previous.longitude));
    if (deltaLongitude > Math.PI) deltaLongitude = 2 * Math.PI - deltaLongitude;
    const deltaPsi = Math.log(Math.tan(Math.PI / 4 + nextLatitude / 2)
      / Math.tan(Math.PI / 4 + latitude / 2));
    const q = Math.abs(deltaPsi) > 1e-12 ? deltaLatitude / deltaPsi : Math.cos(latitude);
    length += Math.hypot(deltaLatitude, q * deltaLongitude) * EARTH_RADIUS_METERS;
  }
  return length;
}

function policy(lineDashPattern) {
  return { lineDashPattern, key: lineDashPattern ? lineDashPattern.join(':') : 'solid' };
}

// Call once per map with every rendered dashed path. The returned key MUST be
// part of each Polyline key: react-native-maps 1.27.2 doesn't clear native spans
// when the dash prop is removed, and can apply the OLD pattern to NEW coordinates.
export function getMapDashPolicy(paths, pattern, platform) {
  if (!pattern) return policy(undefined);
  if (platform !== 'ios') return policy(pattern);
  if (!Array.isArray(pattern) || pattern.length < 2 || pattern.length % 2
    || pattern.some((value) => !Number.isFinite(value) || value <= 0)
    || !Array.isArray(paths) || paths.some((path) => !Array.isArray(path))) return policy(undefined);

  const lines = paths.filter((path) => path.length > 1);
  if (!lines.length || lines.length >= MAP_DASH_SPAN_BUDGET) return policy(undefined);
  const totalMeters = lines.reduce((sum, path) => sum + pathLengthMeters(path), 0);
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return policy(undefined);

  // Reserve one rounded-up span per path. A 1% distance margin also covers
  // floating-point/spherical-model differences with the native SDK.
  const scale = Math.max(1, Math.ceil(totalMeters * 1.01
    / ((MAP_DASH_SPAN_BUDGET - lines.length) * Math.min(...pattern))));
  const scaled = pattern.map((value) => value * scale);
  return policy(scaled.every(Number.isFinite) ? scaled : undefined);
}
