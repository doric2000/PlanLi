import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';
import { resolveRecommendationDestination } from './RecommendationService';
import { compactDestinationText } from '../utils/destinationSearch';

let searchPlacesCallable;
let resolvePlaceSelectionCallable;

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

function mapPrediction(prediction, sessionId, expiresAt, incidentId) {
  const primaryText = prediction.primaryText || prediction.text || '';
  const providerPlaceId = prediction.providerPlaceId || prediction.placeId;
  return {
    // Existing picker components use place_id. This remains a permanent Google
    // identifier, while the server owns all mutable Place details.
    id: prediction.selectionId,
    place_id: providerPlaceId,
    provider: prediction.provider || 'google',
    providerPlaceId,
    selectionId: prediction.selectionId,
    sessionId,
    expiresAt,
    incidentId,
    description: [primaryText, prediction.secondaryText].filter(Boolean).join(', '),
    structured_formatting: {
      main_text: primaryText,
      secondary_text: prediction.secondaryText || '',
    },
    types: prediction.types || [],
  };
}

async function gatewaySearch(searchText, mode) {
  const query = searchText?.trim() || '';
  if (compactDestinationText(query).length < 2) return [];
  const response = await getSearchPlacesCallable()({ query, mode });
  const result = response?.data || {};
  const predictions = (result.predictions || []).map((prediction) =>
    mapPrediction(prediction, result.sessionId, result.expiresAt, result.incidentId)
  );
  return predictions;
}

export const searchCities = async (searchText, { signal } = {}) => {
  if (signal?.aborted) return [];
  try {
    const results = await gatewaySearch(searchText, 'destinations');
    return signal?.aborted ? [] : results;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') return [];
    throw error;
  }
};

export const searchPlaces = async (searchText, { signal } = {}) => {
  if (signal?.aborted) return [];
  try {
    const results = await gatewaySearch(searchText, 'places');
    return signal?.aborted ? [] : results;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') return [];
    throw error;
  }
};

// Destination ownership and geopolitical resolution are server-only. Preview and
// save use the same resolver, so a client cannot present one destination and save another.
export const resolveDestinationForPlacePreview = async (selectionOrPlaceId, {
  selectionIntent = 'exact_place',
  confirmedHebrewName = null,
} = {}) => {
  const selection = selectionOrPlaceId && typeof selectionOrPlaceId === 'object'
    ? selectionOrPlaceId
    : null;
  const placeId = selection?.providerPlaceId || selection?.place_id || selectionOrPlaceId;
  if (!selection?.sessionId || !selection?.selectionId) {
    return resolveRecommendationDestination(typeof selectionOrPlaceId === 'object'
      ? {
          ...(selectionOrPlaceId || {}),
          selectionIntent,
          ...(confirmedHebrewName ? { confirmedHebrewName } : {}),
        }
      : { placeId, selectionIntent, ...(confirmedHebrewName ? { confirmedHebrewName } : {}) });
  }
  const response = await getResolvePlaceSelectionCallable()({
    sessionId: selection.sessionId,
    selectionId: selection.selectionId,
    incidentId: selection.incidentId,
    supportsDestinationChoice: true,
    supportsDestinationSearch: true,
    selectionIntent,
    ...(confirmedHebrewName ? { confirmedHebrewName } : {}),
  });
  const resolved = response?.data || {};
  const resolvedPlaceToken = response?.data?.resolvedPlaceToken;
  if (resolved.status !== 'resolved') {
    return { ...resolved, resolvedPlaceToken };
  }
  const result = resolved.destination
    ? resolved
    : await resolveRecommendationDestination({
        resolvedPlaceToken,
        incidentId: resolved.incidentId || selection.incidentId,
        selectionIntent,
        ...(confirmedHebrewName ? { confirmedHebrewName } : {}),
      });
  return {
    ...result,
    resolvedPlaceToken,
    incidentId: result?.incidentId || resolved.incidentId || selection.incidentId,
    place: (result?.place || resolved?.place)
      ? {
          ...(result?.place || resolved?.place),
          resolvedPlaceToken,
          incidentId: result?.incidentId || resolved.incidentId || selection.incidentId,
        }
      : result?.place,
  };
};

export const finalizeDestinationChoice = async ({
  resolutionId,
  destinationChoiceId,
  destinationRef,
  destinationResolvedPlaceToken,
  incidentId,
}) => {
  const response = await getResolvePlaceSelectionCallable()({
    resolutionId,
    ...(destinationChoiceId ? { destinationChoiceId } : {}),
    ...(destinationRef ? { destinationRef } : {}),
    ...(destinationResolvedPlaceToken ? { destinationResolvedPlaceToken } : {}),
    incidentId,
    supportsDestinationChoice: true,
  });
  const result = response?.data || {};
  return {
    ...result,
    place: result.place
      ? {
          ...result.place,
          resolvedPlaceToken: result.resolvedPlaceToken,
          incidentId: result.incidentId || incidentId,
        }
      : result.place,
  };
};

export const confirmProvisionalDestinationName = async ({
  resolvedPlaceToken,
  incidentId,
  confirmedHebrewName,
}) => {
  const result = await resolveRecommendationDestination({
    resolvedPlaceToken,
    incidentId,
    selectionIntent: 'destination',
    confirmedHebrewName,
    supportsDestinationChoice: true,
    supportsDestinationSearch: true,
  });
  const confirmedResolvedPlaceToken = result?.resolvedPlaceToken || resolvedPlaceToken;
  const confirmedIncidentId = result?.incidentId || incidentId;
  return {
    ...result,
    resolvedPlaceToken: confirmedResolvedPlaceToken,
    incidentId: confirmedIncidentId,
    place: result?.place
      ? {
          ...result.place,
          resolvedPlaceToken: confirmedResolvedPlaceToken,
          incidentId: confirmedIncidentId,
        }
      : result?.place,
  };
};
