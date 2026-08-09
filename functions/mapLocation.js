const { geohashForLocation } = require('geofire-common');

function normalizeMapCoordinates(value) {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function buildMapLocation(value) {
  const coordinates = normalizeMapCoordinates(value);
  if (!coordinates) return null;
  return {
    geohash: geohashForLocation([coordinates.lat, coordinates.lng]),
    ...coordinates,
  };
}

module.exports = {
  buildMapLocation,
  normalizeMapCoordinates,
};
