const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Computes the great-circle distance between two coordinates using the Haversine formula.
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @returns {number} Distance in kilometers
 */
export const haversineDistanceKm = (from, to) => {
  const lat1 = Number(from?.lat);
  const lon1 = Number(from?.lng);
  const lat2 = Number(to?.lat);
  const lon2 = Number(to?.lng);

  if (![lat1, lon1, lat2, lon2].every((v) => Number.isFinite(v))) {
    return NaN;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * Extracts coordinates from a stored place object.
 * Supports current shape: place.coordinates = { lat, lng }
 * and legacy/test shape: place.geometry.location = { lat, lng }.
 *
 * @param {any} place
 * @returns {{ lat: number, lng: number } | null}
 */
export const getPlaceCoordinates = (place) => {
  const lat = place?.coordinates?.lat ?? place?.geometry?.location?.lat ?? place?.lat;
  const lng = place?.coordinates?.lng ?? place?.geometry?.location?.lng ?? place?.lng;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  return { lat: latNum, lng: lngNum };
};
