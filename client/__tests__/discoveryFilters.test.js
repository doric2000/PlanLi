import {
  applySmartProfileFilters,
  createEmptyDiscoveryFilters,
  discoveryRequestFromFilters,
  hasDiscoveryFilters,
  removeDiscoveryFilter,
} from '../src/utils/discoveryFilters';

describe('shared community and route filters', () => {
  it('applies profile choices as visible hard filters without changing destinations', () => {
    const current = {
      ...createEmptyDiscoveryFilters(),
      destinations: [{ countryId: 'cty-il', cityId: 'city-tlv', label: 'תל אביב' }],
    };
    const result = applySmartProfileFilters(current, {
      interests: ['food'], travelParties: ['couple'], vibe: ['romantic'],
      travelerStyles: ['city_break'], needs: ['vegetarian'], budget: 'balanced', pace: 'relaxed',
    }, { surface: 'routes' });
    expect(result.destinations).toEqual(current.destinations);
	expect(result.interestIds).toBeUndefined();
    expect(result.audienceIds).toEqual(['couple']);
	expect(result.travelerStyleIds).toEqual(['city_break']);
    expect(result.paceIds).toEqual(['relaxed']);
    expect(hasDiscoveryFilters(result)).toBe(true);
  });

  it('strips destination labels from callable payloads and preserves numeric ranges', () => {
    const request = discoveryRequestFromFilters({
      ...createEmptyDiscoveryFilters(),
      query: '  חוף  ',
      destinations: [{ countryId: 'cty-il', cityId: 'city-tlv', label: 'תל אביב' }],
      durationDays: { min: '2', max: '5' },
	}, { surface: 'routes' });
    expect(request.query).toBe('חוף');
    expect(request.destinations).toEqual([{ countryId: 'cty-il', cityId: 'city-tlv' }]);
    expect(request.filters.durationDays).toEqual({ min: '2', max: '5' });
  });

  it('removes array, destination, text and range filters deterministically', () => {
    const filters = {
      ...createEmptyDiscoveryFilters(),
	  query: 'ים', audienceIds: ['couple', 'friends'],
      destinations: [{ countryId: 'cty-il', cityId: 'city-tlv' }],
      distanceKm: { min: 10, max: 20 },
    };
	expect(removeDiscoveryFilter(filters, 'audienceIds', 'friends').audienceIds).toEqual(['couple']);
    expect(removeDiscoveryFilter(filters, 'destinations', 'cty-il:city-tlv').destinations).toEqual([]);
    expect(removeDiscoveryFilter(filters, 'query').query).toBe('');
    expect(removeDiscoveryFilter(filters, 'distanceKm').distanceKm).toBeNull();
  });
});
