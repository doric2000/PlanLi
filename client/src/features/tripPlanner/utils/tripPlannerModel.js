export const DEFAULT_REGION = {
  latitude: 31.7683,
  longitude: 35.2137,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

export const coordinatesForStop = (stop) => {
  const lat = Number(stop?.coordinates?.lat ?? stop?.coordinates?.latitude);
  const lng = Number(stop?.coordinates?.lng ?? stop?.coordinates?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
};

export const orderedDays = (trip) => [...(trip?.days || [])].sort((a, b) => Number(a.order) - Number(b.order));
export const orderedStops = (day) => [...(day?.stops || [])].sort((a, b) => Number(a.order) - Number(b.order));
export const getDay = (trip, dayId) => orderedDays(trip).find((day) => day.id === dayId) || orderedDays(trip)[0] || null;

export function regionForStops(stops, fallback = DEFAULT_REGION) {
  const points = (stops || []).map(coordinatesForStop).filter(Boolean);
  if (!points.length) return fallback;
  const latitudes = points.map((item) => item.latitude);
  const longitudes = points.map((item) => item.longitude);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const east = Math.max(...longitudes);
  const west = Math.min(...longitudes);
  return {
    latitude: (north + south) / 2,
    longitude: (east + west) / 2,
    latitudeDelta: Math.max(0.06, (north - south) * 1.65),
    longitudeDelta: Math.max(0.06, (east - west) * 1.65),
  };
}

export const viewportForRegion = (region) => ({
  north: Math.min(90, region.latitude + region.latitudeDelta / 2),
  south: Math.max(-90, region.latitude - region.latitudeDelta / 2),
  east: Math.min(180, region.longitude + region.longitudeDelta / 2),
  west: Math.max(-180, region.longitude - region.longitudeDelta / 2),
  zoom: Math.max(0, Math.min(24, Math.log2(360 / Math.max(region.longitudeDelta, 0.0001)))),
});

export function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

export const routeCoordinates = (route, stops) => {
  const decoded = (route?.segments || []).flatMap((segment, index) => {
    const points = decodePolyline(segment.encodedPolyline || '');
    return index ? points.slice(1) : points;
  });
  return decoded.length ? decoded : (stops || []).map(coordinatesForStop).filter(Boolean);
};

export function routeSummary(route) {
  const meters = Number(route?.totals?.distanceMeters) || 0;
  const seconds = Number(route?.totals?.durationSeconds) || 0;
  if (!meters && !seconds) return '';
  const distance = meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} ק״מ` : `${Math.round(meters)} מ׳`;
  const minutes = Math.round(seconds / 60);
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} ש׳ ${minutes % 60 ? `${minutes % 60} דק׳` : ''}` : `${minutes} דק׳`;
  return [distance, duration].filter(Boolean).join(' · ');
}

const clone = (value) => JSON.parse(JSON.stringify(value));

export function applyOperationsLocally(tripValue, operations, recommendationPreviews = {}) {
  const trip = clone(tripValue);
  (operations || []).forEach((operation) => {
    if (operation.type === 'set_title') trip.title = operation.title;
    if (operation.type === 'add_day') {
      const maxOrder = Math.max(0, ...trip.days.map((day) => Number(day.order) || 0));
      trip.days.push({ id: operation.clientId, kind: 'day', title: operation.title, date: operation.date || null, travelMode: operation.travelMode || 'DRIVE', order: maxOrder + 1, stopCount: 0, stops: [] });
      trip.dayCount += 1;
    }
    const day = trip.days.find((item) => item.id === operation.dayId);
    if (!day) return;
    if (operation.type === 'update_day') Object.assign(day, { ...operation, type: undefined, dayId: undefined });
    if (operation.type === 'add_custom_stop') {
      day.stops.push({ id: operation.clientId, ...operation.stop, order: day.stops.length });
      day.stopCount += 1;
      trip.stopCount += 1;
    }
    if (operation.type === 'add_recommendation_stops') {
      operation.recommendationIds.forEach((id) => {
        const preview = recommendationPreviews[id] || {};
        const raw = preview.place?.coordinates;
        const lat = Number(raw?.lat ?? raw?.latitude);
        const lng = Number(raw?.lng ?? raw?.longitude);
        day.stops.push({ id: `pending-${id}-${day.stops.length}`, sourceType: 'recommendation', recommendationId: id,
          title: preview.title || 'המלצה שנבחרה', subtitle: preview.place?.address || preview.destination?.cityName || preview.description || '',
          media: preview.media || [], coordinates: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
          order: day.stops.length });
      });
      day.stopCount = day.stops.length;
      trip.stopCount = trip.days.reduce((sum, item) => sum + item.stops.length, 0);
    }
    if (operation.type === 'update_custom_stop') {
      day.stops = day.stops.map((stop) => stop.id === operation.stopId ? { ...stop, ...operation.stop } : stop);
    }
    if (operation.type === 'delete_stop') {
      day.stops = day.stops.filter((stop) => stop.id !== operation.stopId).map((stop, index) => ({ ...stop, order: index }));
      day.stopCount = day.stops.length;
      trip.stopCount = trip.days.reduce((sum, item) => sum + item.stops.length, 0);
    }
    if (operation.type === 'move_stop') {
      const target = trip.days.find((item) => item.id === operation.targetDayId);
      const moved = day.stops.find((stop) => stop.id === operation.stopId);
      if (target && moved) {
        day.stops = day.stops.filter((stop) => stop.id !== operation.stopId).map((stop, index) => ({ ...stop, order: index }));
        target.stops.push({ ...moved, order: target.stops.length });
        day.stopCount = day.stops.length;
        target.stopCount = target.stops.length;
      }
    }
    if (operation.type === 'reorder_stops') {
      const byId = new Map(day.stops.map((stop) => [stop.id, stop]));
      day.stops = operation.stopIds.map((id, index) => ({ ...byId.get(id), order: index })).filter((stop) => stop.id);
    }
  });
  trip.revision = Number(trip.revision) + 1;
  return trip;
}
