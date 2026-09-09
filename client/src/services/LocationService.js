import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';
import { resolveRecommendationDestination } from './RecommendationService';
import { compactDestinationText } from '../utils/destinationSearch';
import { searchDestinations } from './DestinationService';

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

async function gatewaySearch(searchText, mode, { locationBias } = {}) {
  const query = searchText?.trim() || '';
  if (compactDestinationText(query).length < 2) return [];
  const response = await getSearchPlacesCallable()({
    query,
    mode,
    ...(locationBias ? { locationBias } : {}),
  });
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

export async function searchDestinationChoices(query, { countryId, onResults } = {}) {
  const catalogRequest = searchDestinations({ query, countryId, limit: 10 }).then((result) => {
    const local = (result?.items || []).map((item) => ({
      id: `catalog:${item.countryId}:${item.cityId}`,
      destinationRef: { countryId: item.countryId, cityId: item.cityId },
      structured_formatting: {
        main_text: item.names?.he || item.names?.en,
        secondary_text: item.countryNames?.he || item.countryNames?.en || item.countryId,
      },
    }));
    // Existing verified destinations stay selectable while Google is pending.
    if (local.length) onResults?.(local);
    return local;
  });
  const [catalog, provider] = await Promise.allSettled([
    catalogRequest,
    searchCities(countryId ? `${query}, ${countryId}` : query),
  ]);
  if (catalog.status === 'rejected' && provider.status === 'rejected') throw catalog.reason;
  return [...(catalog.status === 'fulfilled' ? catalog.value : []),
    ...(provider.status === 'fulfilled' ? provider.value : [])];
}

export const requestDestinationChoice = ({ resolvedPlaceToken, incidentId, placeId }) =>
  resolveRecommendationDestination({
    resolvedPlaceToken, incidentId, placeId, requestDestinationChoice: true,
    supportsDestinationChoice: true, supportsDestinationSearch: true,
  });

export const searchPlaces = async (searchText, { signal, locationBias } = {}) => {
  if (signal?.aborted) return [];
  try {
    const results = await gatewaySearch(searchText, 'places', { locationBias });
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
  const placeId = selection?.providerPlaceId || selection?.place_id || selection?.placeId || selectionOrPlaceId;
  if (!selection?.sessionId || !selection?.selectionId) {
    const result = await resolveRecommendationDestination(typeof selectionOrPlaceId === 'object'
      ? {
          ...(selectionOrPlaceId || {}),
          ...(typeof placeId === 'string' ? { placeId } : {}),
          supportsDestinationChoice: true,
          supportsDestinationSearch: true,
          selectionIntent,
          ...(confirmedHebrewName ? { confirmedHebrewName } : {}),
        }
      : { placeId, selectionIntent, supportsDestinationChoice: true, supportsDestinationSearch: true,
          ...(confirmedHebrewName ? { confirmedHebrewName } : {}) });
    return { ...result, ...(result?.place ? { place: { ...result.place,
      ...(result.resolvedPlaceToken ? { resolvedPlaceToken: result.resolvedPlaceToken } : {}),
      ...(result.incidentId ? { incidentId: result.incidentId } : {}),
    } } : {}) };
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
  selectionIntent = 'destination',
}) => {
  const result = await resolveRecommendationDestination({
    resolvedPlaceToken,
    incidentId,
    selectionIntent,
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
