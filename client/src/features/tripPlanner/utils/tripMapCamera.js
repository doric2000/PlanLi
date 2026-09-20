const TILE_SIZE = 256;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mercatorY = (latitude) => {
  const radians = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
};

// Calculate the initial camera without asking a not-yet-laid-out native map to
// fit a region. Google Maps' cameraForBounds depends on the native view's frame.
export function tripMapCamera(region, { width, height }) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return null;
  const north = mercatorY(region.latitude + region.latitudeDelta / 2);
  const south = mercatorY(region.latitude - region.latitudeDelta / 2);
  const centerY = mercatorY(region.latitude);
  const padding = Math.min(24, width / 4, height / 4);
  const longitudeFraction = Math.max(region.longitudeDelta / 360, 1e-8);
  // Mercator is asymmetric around the latitude midpoint. Reserve enough room
  // for the farther edge so widely separated stops still fit on a short card.
  const latitudeFraction = Math.max(Math.max(north - centerY, centerY - south) / Math.PI, 1e-8);
  return {
    center: {
      latitude: clamp(region.latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
      longitude: region.longitude,
    },
    zoom: clamp(Math.min(
      Math.log2((width - padding * 2) / (TILE_SIZE * longitudeFraction)),
      Math.log2((height - padding * 2) / (TILE_SIZE * latitudeFraction)),
    ), 0, 16),
    heading: 0,
    pitch: 0,
  };
}
