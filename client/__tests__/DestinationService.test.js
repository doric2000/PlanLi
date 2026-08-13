import { httpsCallable } from 'firebase/functions';
import {
  clearDestinationSearchCache,
  destinationCatalogItemToCity,
  searchDestinations,
} from '../src/services/DestinationService';

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));

describe('DestinationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    const callable = jest.fn(async () => ({ data: { items: [{ cityId: 'st-johns' }] } }));
    httpsCallable.mockReturnValue(callable);

    const [first, second] = await Promise.all([
      searchDestinations({ query: 'St. John’s', sort: 'popular', limit: 30 }),
      searchDestinations({ query: '  st johns ', sort: 'popular', limit: 30 }),
    ]);

    expect(callable).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});
