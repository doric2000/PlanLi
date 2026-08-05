import { Platform } from 'react-native';
import { resolveRecommendationDestination } from './RecommendationService';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
const PLACES_PROXY_BASE_URL =
  process.env.EXPO_PUBLIC_PLACES_PROXY_BASE_URL ||
  (Platform.OS === 'web' ? 'http://localhost:5000' : '');

const parseJsonResponse = async (response) => {
  const contentType = response.headers?.get?.('content-type') || '';
  const text = await response.text();
  if (response.ok && contentType.includes('application/json')) {
    return JSON.parse(text);
  }

  const error = new Error(
    contentType.includes('text/html')
      ? 'Places proxy returned HTML. Start the local proxy on port 5000.'
      : `Places request failed (${response.status}).`
  );
  error.status = response.status;
  error.contentType = contentType;
  throw error;
};

const fetchPlacesAutocomplete = async (searchText, { signal, types = '(cities)' } = {}) => {
  if (Platform.OS === 'web') {
    const base = `${PLACES_PROXY_BASE_URL}/api/places/autocomplete?input=${encodeURIComponent(searchText)}`;
    const url = types ? `${base}&types=${encodeURIComponent(types)}` : base;
    return parseJsonResponse(await fetch(url, { signal }));
  }

  const params = new URLSearchParams();
  params.set('input', searchText);
  if (types && types !== 'all') params.set('types', types);
  params.set('language', 'he');
  params.set('key', GOOGLE_API_KEY);
  return parseJsonResponse(await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
    { signal }
  ));
};

const fetchPlacesTextSearch = async (searchText, { signal } = {}) => {
  if (Platform.OS === 'web') {
    const url = `${PLACES_PROXY_BASE_URL}/api/places/textsearch?query=${encodeURIComponent(searchText)}`;
    return parseJsonResponse(await fetch(url, { signal }));
  }

  const params = new URLSearchParams();
  params.set('query', searchText);
  params.set('language', 'he');
  params.set('key', GOOGLE_API_KEY);
  return parseJsonResponse(await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
    { signal }
  ));
};

export const fetchPlaceDetails = async (placeId, { fields } = {}) => {
  if (Platform.OS === 'web') {
    const base = `${PLACES_PROXY_BASE_URL}/api/places/details?placeId=${encodeURIComponent(placeId)}`;
    const url = fields ? `${base}&fields=${encodeURIComponent(fields)}` : base;
    return parseJsonResponse(await fetch(url));
  }

  const resolvedFields =
    fields || 'name,formatted_address,address_components,geometry,photos,place_id,url';
  const params = new URLSearchParams({
    place_id: placeId,
    fields: resolvedFields,
    language: 'he',
    key: GOOGLE_API_KEY,
  });
  return parseJsonResponse(await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
  ));
};

export const searchCities = async (searchText, { signal } = {}) => {
  if (!searchText || searchText.length < 2) return [];
  try {
    const data = await fetchPlacesAutocomplete(searchText, { signal, types: '(cities)' });
    return (Array.isArray(data?.predictions) ? data.predictions : []).map((prediction) => ({
      id: prediction.place_id,
      place_id: prediction.place_id,
      name: prediction.structured_formatting?.main_text || prediction.description,
      description: prediction.description,
    }));
  } catch (error) {
    if (error?.name === 'AbortError') return [];
    console.error('Error fetching city predictions:', error);
    return [];
  }
};

export const searchPlaces = async (searchText, { signal, types = 'all' } = {}) => {
  if (!searchText || searchText.length < 2) return [];
  try {
    const data = await fetchPlacesAutocomplete(searchText, { signal, types });
    const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
    if (predictions.length > 0) return predictions;

    const textData = await fetchPlacesTextSearch(searchText, { signal });
    return (Array.isArray(textData?.results) ? textData.results : [])
      .filter((result) => result?.place_id)
      .map((result) => ({
        place_id: result.place_id,
        description: [result.name, result.formatted_address].filter(Boolean).join(' — '),
      }));
  } catch (error) {
    if (error?.name === 'AbortError') return [];
    console.error('Error fetching place predictions:', error);
    return [];
  }
};

// Destination ownership and geopolitical resolution are server-only. Preview and save
// deliberately call the same resolver so the user cannot see one country and save another.
export const resolveDestinationForPlacePreview = (placeId) =>
  resolveRecommendationDestination(placeId);
