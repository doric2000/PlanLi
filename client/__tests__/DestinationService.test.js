import { destinationCatalogItemToCity } from '../src/services/DestinationService';

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));

describe('DestinationService', () => {
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
});
