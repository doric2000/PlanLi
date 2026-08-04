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
    }, { includeRoute: true });
    expect(result.destinations).toEqual(current.destinations);
    expect(result.interestIds).toEqual(['food']);
    expect(result.audienceIds).toEqual(['couple']);
    expect(result.paceIds).toEqual(['relaxed']);
    expect(hasDiscoveryFilters(result)).toBe(true);
  });

  it('strips destination labels from callable payloads and preserves numeric ranges', () => {
    const request = discoveryRequestFromFilters({
      ...createEmptyDiscoveryFilters(),
      query: '  חוף  ',
      destinations: [{ countryId: 'cty-il', cityId: 'city-tlv', label: 'תל אביב' }],
      durationDays: { min: '2', max: '5' },
    });
    expect(request.query).toBe('חוף');
    expect(request.destinations).toEqual([{ countryId: 'cty-il', cityId: 'city-tlv' }]);
    expect(request.filters.durationDays).toEqual({ min: '2', max: '5' });
  });

  it('removes array, destination, text and range filters deterministically', () => {
    const filters = {
      ...createEmptyDiscoveryFilters(),
      query: 'ים', interestIds: ['beaches_water', 'food'],
      destinations: [{ countryId: 'cty-il', cityId: 'city-tlv' }],
      distanceKm: { min: 10, max: 20 },
    };
    expect(removeDiscoveryFilter(filters, 'interestIds', 'food').interestIds).toEqual(['beaches_water']);
    expect(removeDiscoveryFilter(filters, 'destinations', 'cty-il:city-tlv').destinations).toEqual([]);
    expect(removeDiscoveryFilter(filters, 'query').query).toBe('');
    expect(removeDiscoveryFilter(filters, 'distanceKm').distanceKm).toBeNull();
  });
});
