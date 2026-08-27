import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDocs } from 'firebase/firestore';

import { useDestinationFilterOptions } from '../src/hooks/useDestinationFilterOptions';
import { searchDestinations } from '../src/services/DestinationService';

let mockRegionId = null;

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ type: 'collection' })),
  getDocs: jest.fn(),
  limit: jest.fn((value) => ({ type: 'limit', value })),
  query: jest.fn((...parts) => ({ type: 'query', parts })),
  where: jest.fn((...parts) => ({ type: 'where', parts })),
}));
jest.mock('../src/config/firebase', () => ({ db: {} }));
jest.mock('../src/services/DestinationService', () => ({
  searchDestinations: jest.fn(),
}));
jest.mock('../src/features/region/context/RegionSelectionState', () => ({
  useOptionalRegionSelection: () => ({ selectedRegionId: mockRegionId }),
}));

describe('useDestinationFilterOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegionId = null;
    delete process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
  });

  it('merges a debounced remote match outside the popular catalog with bilingual names', async () => {
    getDocs.mockResolvedValue({
      docs: [{
        id: 'CA',
        data: () => ({ status: 'active', names: { he: 'קנדה', en: 'Canada' } }),
      }],
    });
    searchDestinations.mockImplementation(async ({ query: searchQuery }) => ({
      items: searchQuery ? [{
        cityId: 'st-johns',
        countryId: 'CA',
        names: { he: 'סנט ג׳ונס', en: 'St. John’s' },
        countryNames: { he: 'קנדה', en: 'Canada' },
        recommendationCount: 1,
      }] : [],
    }));

    const { result } = renderHook(() => useDestinationFilterOptions(true, 'St Johns'));

    await waitFor(() => expect(result.current.searchLoading).toBe(false));
    await waitFor(() => expect(result.current.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'city:CA:st-johns',
        names: { he: 'סנט ג׳ונס', en: 'St. John’s' },
        countryNames: { he: 'קנדה', en: 'Canada' },
      }),
    ])));
    expect(searchDestinations).toHaveBeenCalledWith({
      query: 'St Johns',
      sort: 'popular',
      limit: 30,
    });
  });

  it('ignores a stale destination response after the query changes', async () => {
    let resolveOld;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    searchDestinations.mockImplementation(({ query: searchQuery }) => {
      if (searchQuery === 'old query') return oldResponse;
      return Promise.resolve({
        items: [{
          cityId: 'new-city',
          countryId: 'US',
          names: { en: 'New City' },
          countryNames: { en: 'United States' },
        }],
      });
    });

    const { result, rerender } = renderHook(
      ({ query }) => useDestinationFilterOptions(true, query),
      { initialProps: { query: 'old query' } }
    );
    rerender({ query: 'new query' });
    await waitFor(() => expect(result.current.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ cityId: 'new-city' }),
    ])));

    resolveOld({
      items: [{ cityId: 'old-city', countryId: 'US', names: { en: 'Old City' } }],
    });
    await waitFor(() => expect(result.current.searchLoading).toBe(false));
    expect(result.current.options).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ cityId: 'old-city' }),
    ]));
  });

  it('does not search the catalog for punctuation-only input', async () => {
    const { result } = renderHook(() => useDestinationFilterOptions(true, " !–' "));
    await waitFor(() => expect(result.current.searchLoading).toBe(false));
    expect(searchDestinations).not.toHaveBeenCalledWith(expect.objectContaining({
      query: expect.anything(),
    }));
  });

  it('exposes a retry after a remote destination search fails', async () => {
    searchDestinations.mockImplementation(({ query: searchQuery }) => (
      searchQuery
        ? Promise.reject(new Error('temporary outage'))
        : Promise.resolve({ items: [] })
    ));
    const { result } = renderHook(() => useDestinationFilterOptions(true, 'Budapest'));

    await waitFor(() => expect(result.current.searchError).toBe('לא הצלחנו לחפש יעדים כרגע.'));
    searchDestinations.mockResolvedValue({
      items: [{
        cityId: 'budapest',
        countryId: 'HU',
        names: { he: 'בודפשט' },
        countryNames: { he: 'הונגריה' },
        coordinates: { lat: 47.4979, lng: 19.0402 },
      }],
    });
    act(() => result.current.retrySearch());

    await waitFor(() => expect(result.current.searchError).toBe(''));
    await waitFor(() => expect(result.current.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ cityId: 'budapest' }),
    ])));
  });

  it('hides cached options from the previous region even when the next load fails', async () => {
    process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED = 'true';
    mockRegionId = 'europe';
    getDocs.mockResolvedValue({
      docs: [{ id: 'FR', data: () => ({ status: 'active', names: { he: 'צרפת' } }) }],
    });
    searchDestinations.mockResolvedValue({ items: [] });
    const { result, rerender } = renderHook(() => useDestinationFilterOptions(true, ''));
    await waitFor(() => expect(result.current.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ countryId: 'FR' }),
    ])));

    mockRegionId = 'israel';
    getDocs.mockRejectedValue(new Error('load failed'));
    searchDestinations.mockRejectedValue(new Error('load failed'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    rerender({});

    expect(result.current.options).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.options).toEqual([]);
    consoleError.mockRestore();
  });
});
