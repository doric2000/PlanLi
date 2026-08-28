import {
  canDisplayDestinationImageWithoutCredit,
  getDestinationImageUrl,
} from '../../../utils/destinationImages';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import { flattenRouteStops } from './routeStops';

function normalizedName(value) {
  return String(value || '').trim();
}

function stopImageForDestination(stops, destination) {
  const stop = stops.find((entry) =>
    entry?.destination?.countryId === destination?.countryId &&
    entry?.destination?.cityId === destination?.cityId
  );
  return stop ? getMediaVariantUrl(stop.media, 'thumb', stop.image) : null;
}

export function getRouteDestinationPreviews(route, maximum = 4) {
  const stops = flattenRouteStops(route);
  const canonical = Array.isArray(route?.destinationPreviews) && route.destinationPreviews.length
    ? route.destinationPreviews
    : Array.isArray(route?.destinations) && route.destinations.length
      ? route.destinations
      : (Array.isArray(route?.summaryPlaces) ? route.summaryPlaces : []).map((name) => ({ name }));
  const seen = new Set();
  const previews = [];

  for (const destination of canonical) {
    const value = typeof destination === 'string' ? { name: destination } : destination || {};
    const name = normalizedName(value.name || value.cityName || value.names?.he || value.names?.en || value.cityId);
    const key = value.countryId && value.cityId
      ? `${value.countryId}:${value.cityId}`
      : name.toLocaleLowerCase();
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    const stopImage = stopImageForDestination(stops, value);
    const destinationImage = canDisplayDestinationImageWithoutCredit(value)
      ? value.imageUrl || getDestinationImageUrl(value, 'thumb')
      : null;
    previews.push({
      ...value,
      name,
      imageUrl: stopImage || destinationImage,
    });
    if (previews.length >= maximum) break;
  }
  return previews;
}
