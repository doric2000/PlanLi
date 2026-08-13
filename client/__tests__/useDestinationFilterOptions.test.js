import { renderHook, waitFor } from '@testing-library/react-native';
import { getDocs } from 'firebase/firestore';

import { useDestinationFilterOptions } from '../src/hooks/useDestinationFilterOptions';
import { searchDestinations } from '../src/services/DestinationService';

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

describe('useDestinationFilterOptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
