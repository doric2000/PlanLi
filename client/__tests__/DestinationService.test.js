import {
  clearDestinationSearchCache,
  destinationCatalogItemToCity,
  searchDestinations,
} from '../src/services/DestinationService';

const mockDestinationCallable = jest.fn();
const mockCallPublicCallable = jest.fn(async (name, payload) => {
  const response = await mockDestinationCallable(payload);
  return response?.data || null;
});
jest.mock('../src/services/PublicCallableService', () => ({
  callPublicCallable: (...args) => mockCallPublicCallable(...args),
}));

describe('DestinationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDestinationCallable.mockReset();
    mockCallPublicCallable.mockClear();
    clearDestinationSearchCache();
  });

  it('maps private catalog items to the existing city-card shape', () => {
    const city = destinationCatalogItemToCity({
      cityId: 'paris',
      countryId: 'fr',
      names: { he: 'פריז', en: 'Paris' },
      countryNames: { he: 'צרפת', en: 'France' },
      recommendationCount: 4,
      destinationImage: { source: { type: 'unsplash' } },
    }, '#123456');

    expect(city).toMatchObject({
      id: 'paris',
      cityId: 'paris',
      countryId: 'fr',
      name: 'פריז',
      countryName: 'צרפת',
      stats: { recommendationCount: 4 },
      placeholderColor: '#123456',
    });
    expect(city.identity.names.en).toBe('Paris');
    expect(city.destinationImage.source.type).toBe('unsplash');
  });

  it('coalesces in-flight formatting variants under one bounded cache key', async () => {
    mockDestinationCallable.mockResolvedValue({ data: { items: [{ cityId: 'st-johns' }] } });

    const [first, second] = await Promise.all([
      searchDestinations({ query: 'St. John’s', sort: 'popular', limit: 30 }),
      searchDestinations({ query: '  st johns ', sort: 'popular', limit: 30 }),
    ]);

    expect(mockDestinationCallable).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('caches the default Home destination request', async () => {
    mockDestinationCallable.mockResolvedValue({ data: { items: [{ cityId: 'paris' }] } });

    const first = await searchDestinations({ sort: 'popular', limit: 10 });
    const second = await searchDestinations({ sort: 'popular', limit: 10 });

    expect(second).toBe(first);
  });

  it('removes punctuation-only text before sending a destination search', async () => {
    mockDestinationCallable.mockResolvedValue({ data: { items: [] } });

    await searchDestinations({ query: " !–' ", sort: 'popular', limit: 10 });

    expect(mockDestinationCallable).toHaveBeenCalledWith({ query: '', sort: 'popular', limit: 10 });
  });
});
