import { compactDestinationText } from './destinationSearch';

export const EMPTY_DISCOVERY_FILTERS = Object.freeze({
  query: '',
  destinations: [],
  categoryIds: [],
  subcategoryIds: [],
  audienceIds: [],
  vibeIds: [],
  travelerStyleIds: [],
  needIds: [],
  budgetLevels: [],
  seasons: [],
  environments: [],
  difficultyIds: [],
  experienceLevelIds: [],
  transportModeIds: [],
  paceIds: [],
  durationDays: null,
  distanceKm: null,
});

export const createEmptyDiscoveryFilters = () => ({
  ...EMPTY_DISCOVERY_FILTERS,
  destinations: [],
  categoryIds: [],
  subcategoryIds: [],
  audienceIds: [],
  vibeIds: [],
  travelerStyleIds: [],
  needIds: [],
  budgetLevels: [],
  seasons: [],
  environments: [],
  difficultyIds: [],
  experienceLevelIds: [],
  transportModeIds: [],
  paceIds: [],
});

export function hasDiscoveryFilters(filters, { includeQuery = true } = {}) {
  if (!filters) return false;
  if (includeQuery && compactDestinationText(filters.query)) return true;
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'query') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') {
      return (value.min !== '' && value.min != null) || (value.max !== '' && value.max != null);
    }
    return Boolean(value);
  });
}

export function applySmartProfileFilters(filters, profile, { surface = 'recommendations' } = {}) {
  const isRoutesSurface = surface === 'routes';
  const budgetLevels = profile?.budget && profile.budget !== 'flexible' ? [profile.budget] : [];
	const result = {
    ...filters,
    audienceIds: [...(profile?.travelParties || [])],
    vibeIds: [...(profile?.vibe || [])],
    needIds: [...(profile?.needs || [])],
    budgetLevels,
	...(isRoutesSurface ? {
		travelerStyleIds: [...(profile?.travelerStyles || [])],
		...(profile?.pace ? { paceIds: [profile.pace] } : {}),
	} : { travelerStyleIds: [], seasons: [] }),
  };
	delete result.interestIds;
	return result;
}

export function discoveryRequestFromFilters(filters, { surface = 'recommendations' } = {}) {
  const {
    query,
    destinations,
    ...serverFilters
  } = filters || {};
	delete serverFilters.interestIds;
	if (surface !== 'routes') {
		delete serverFilters.travelerStyleIds;
		delete serverFilters.seasons;
		delete serverFilters.difficultyIds;
		delete serverFilters.experienceLevelIds;
		delete serverFilters.transportModeIds;
		delete serverFilters.paceIds;
		delete serverFilters.durationDays;
		delete serverFilters.distanceKm;
	}
  const trimmedQuery = query?.trim() || '';
  return {
    query: compactDestinationText(trimmedQuery) ? trimmedQuery : '',
    destinations: (destinations || []).map(({ countryId, cityId }) => ({ countryId, cityId: cityId || '' })),
    filters: serverFilters,
  };
}

export function removeDiscoveryFilter(filters, field, value) {
  if (field === 'query') return { ...filters, query: '' };
  const current = filters?.[field];
  if (Array.isArray(current)) return {
    ...filters,
    [field]: current.filter((entry) => {
      if (field === 'destinations') {
        return `${entry.countryId}:${entry.cityId || ''}` !== value;
      }
      return entry !== value;
    }),
  };
  return { ...filters, [field]: null };
}
