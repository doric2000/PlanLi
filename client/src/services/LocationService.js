import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';
import { resolveRecommendationDestination } from './RecommendationService';

let searchPlacesCallable;
let resolvePlaceSelectionCallable;
const pendingSelectionsByPlaceId = new Map();

function getSearchPlacesCallable() {
  if (!searchPlacesCallable) {
    searchPlacesCallable = httpsCallable(cloudFunctions, 'searchPlaces');
  }
  return searchPlacesCallable;
}

function getResolvePlaceSelectionCallable() {
  if (!resolvePlaceSelectionCallable) {
    resolvePlaceSelectionCallable = httpsCallable(cloudFunctions, 'resolvePlaceSelection');
  }
  return resolvePlaceSelectionCallable;
}

function mapPrediction(prediction, sessionId) {
  return {
    // Existing picker components use place_id. This remains a permanent Google
    // identifier, while the server owns all mutable Place details.
    id: prediction.selectionId,
    place_id: prediction.placeId,
    selectionId: prediction.selectionId,
    sessionId,
    description: [prediction.text, prediction.secondaryText].filter(Boolean).join(', '),
    structured_formatting: {
      main_text: prediction.text,
      secondary_text: prediction.secondaryText || '',
    },
    types: prediction.types || [],
  };
}

async function gatewaySearch(searchText, mode) {
  if (!searchText || searchText.trim().length < 2) return [];
  const response = await getSearchPlacesCallable()({ query: searchText.trim(), mode });
  const result = response?.data || {};
  const predictions = (result.predictions || []).map((prediction) => mapPrediction(prediction, result.sessionId));
  predictions.forEach((prediction) => pendingSelectionsByPlaceId.set(prediction.place_id, prediction));
  return predictions;
}

export const searchCities = async (searchText, { signal } = {}) => {
  if (signal?.aborted) return [];
  try {
    return await gatewaySearch(searchText, 'destinations');
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') return [];
    throw error;
  }
};

export const searchPlaces = async (searchText, { signal } = {}) => {
  if (signal?.aborted) return [];
  try {
    return await gatewaySearch(searchText, 'places');
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') return [];
    throw error;
  }
};

// Destination ownership and geopolitical resolution are server-only. Preview and
// save use the same resolver, so a client cannot present one destination and save another.
export const resolveDestinationForPlacePreview = async (placeId) => {
  const selection = pendingSelectionsByPlaceId.get(placeId);
  if (!selection?.sessionId || !selection?.selectionId) {
    return resolveRecommendationDestination(placeId);
  }
  const response = await getResolvePlaceSelectionCallable()({
    sessionId: selection.sessionId,
    selectionId: selection.selectionId,
  });
  pendingSelectionsByPlaceId.delete(placeId);
  return resolveRecommendationDestination({ resolvedPlaceToken: response?.data?.resolvedPlaceToken });
};
