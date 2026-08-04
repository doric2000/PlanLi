export const EMPTY_DISCOVERY_FILTERS = Object.freeze({
  query: '',
  destinations: [],
  categoryIds: [],
  subcategoryIds: [],
  interestIds: [],
  audienceIds: [],
  vibeIds: [],
  travelerStyleIds: [],
  needIds: [],
  budgetLevels: [],
  seasons: [],
  environments: [],
  difficultyIds: [],
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
  interestIds: [],
  audienceIds: [],
  vibeIds: [],
  travelerStyleIds: [],
  needIds: [],
  budgetLevels: [],
  seasons: [],
  environments: [],
  difficultyIds: [],
  transportModeIds: [],
  paceIds: [],
});

export function hasDiscoveryFilters(filters, { includeQuery = true } = {}) {
  if (!filters) return false;
  if (includeQuery && filters.query?.trim()) return true;
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'query') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') {
      return (value.min !== '' && value.min != null) || (value.max !== '' && value.max != null);
    }
    return Boolean(value);
  });
}

export function applySmartProfileFilters(filters, profile, { includeRoute = false } = {}) {
  const budgetLevels = profile?.budget && profile.budget !== 'flexible' ? [profile.budget] : [];
  return {
    ...filters,
    interestIds: [...(profile?.interests || [])],
    audienceIds: [...(profile?.travelParties || [])],
    vibeIds: [...(profile?.vibe || [])],
    travelerStyleIds: [...(profile?.travelerStyles || [])],
    needIds: [...(profile?.needs || [])],
    budgetLevels,
    ...(includeRoute && profile?.pace ? { paceIds: [profile.pace] } : {}),
  };
}

export function discoveryRequestFromFilters(filters) {
  const {
    query,
    destinations,
    ...serverFilters
  } = filters || {};
  return {
    query: query?.trim() || '',
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
