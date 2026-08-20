import { getPlaceCoordinates } from './distance';

const encode = (value) => encodeURIComponent(String(value || '').trim());

export function buildGoogleMapsUrl({ place: inputPlace, destination: inputDestination, fallback = '' } = {}) {
  const place = inputPlace || {};
  const destination = inputDestination || {};
  const coordinates = getPlaceCoordinates(place);
  const query = coordinates
    ? `${coordinates.lat},${coordinates.lng}`
    : fallback || [
        place.name,
        place.address,
        destination.cityName,
        destination.countryName,
      ].filter(Boolean).join(' ');
  if (!query) return null;
  let url = `https://www.google.com/maps/search/?api=1&query=${encode(query)}`;
  if (place.placeId) url += `&query_place_id=${encode(place.placeId)}`;
  return url;
}

export function buildWazeUrl(place) {
  const coordinates = getPlaceCoordinates(place);
  if (!coordinates) return null;
  return `https://waze.com/ul?ll=${encode(`${coordinates.lat},${coordinates.lng}`)}&navigate=yes&utm_source=planli`;
}
