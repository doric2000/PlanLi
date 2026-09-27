import { normalizeRecommendationMapItems } from '../../community/utils/recommendationMap';

export function cityCoordinate(value) {
  const lat = value?.lat ?? value?.latitude;
  const lng = value?.lng ?? value?.longitude;
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const latitude = Number(lat); const longitude = Number(lng);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 85
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

export function cityMapItems(items) {
  const valid = (Array.isArray(items) ? items : []).flatMap((item) => {
    const coordinates = [item?.place?.coordinates, item?.place?.geometry?.location, item?.place, item?.mapLocation]
      .map(cityCoordinate).find(Boolean);
    return coordinates ? [{ ...item, place: { ...item.place, coordinates: { lat: coordinates.latitude, lng: coordinates.longitude } } }] : [];
  });
  return normalizeRecommendationMapItems(valid);
}

export function cityMapRegion(destination, recommendations = []) {
  const center = cityCoordinate(destination?.coordinates) || cityCoordinate(destination?.identity?.coordinates);
  const points = cityMapItems(recommendations).map((item) => cityCoordinate(item.coordinates));
  if (!points.length && !center) return null;
  if (!points.length) return { ...center, latitudeDelta: 0.06, longitudeDelta: 0.06 };
  const latitudes = points.map((p) => p.latitude);
  const longitudes = points.map((p) => p.longitude);
  if (center) { latitudes.push(center.latitude); longitudes.push(center.longitude); }
  const north = Math.max(...latitudes); const south = Math.min(...latitudes);
  const east = Math.max(...longitudes); const west = Math.min(...longitudes);
  return { latitude: (north + south) / 2, longitude: (east + west) / 2,
    latitudeDelta: Math.max(0.025, (north - south) * 1.4),
    longitudeDelta: Math.max(0.025, (east - west) * 1.4) };
}

export function cityMapViewport(region) {
  if (!region || !cityCoordinate(region)) return null;
  const latitudeDelta = Number(region.latitudeDelta); const longitudeDelta = Number(region.longitudeDelta);
  if (!(Number.isFinite(latitudeDelta) && Number.isFinite(longitudeDelta) && latitudeDelta > 0 && longitudeDelta > 0)) return null;
  const longitude = (value) => ((value + 180) % 360 + 360) % 360 - 180;
  return { north: Math.min(85, region.latitude + latitudeDelta / 2), south: Math.max(-85, region.latitude - latitudeDelta / 2),
    east: longitude(region.longitude + longitudeDelta / 2), west: longitude(region.longitude - longitudeDelta / 2),
    zoom: Math.max(0, Math.min(20, Math.log2(360 / longitudeDelta))) };
}
