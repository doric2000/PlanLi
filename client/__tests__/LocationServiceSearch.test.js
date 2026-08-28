import { httpsCallable } from 'firebase/functions';

import {
  confirmProvisionalDestinationName,
  searchCities,
  searchPlaces,
} from '../src/services/LocationService';
import { resolveRecommendationDestination } from '../src/services/RecommendationService';

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('../src/services/RecommendationService', () => ({
  resolveRecommendationDestination: jest.fn(),
}));

describe('LocationService search guards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not call the Places gateway for punctuation-only searches', async () => {
    await expect(searchCities(" !–' ")).resolves.toEqual([]);
    await expect(searchPlaces('...')).resolves.toEqual([]);
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('keeps the confirmed destination token on the place used by recommendation publishing', async () => {
    resolveRecommendationDestination.mockResolvedValue({
      status: 'resolved',
      incidentId: 'loc_confirmed',
      place: { placeId: 'google-dolomites', name: 'Dolomites' },
      destination: {
        country: { id: 'IT', name: 'איטליה' },
        city: { id: 'dolomites', name: 'הדולומיטים' },
      },
    });

    await expect(confirmProvisionalDestinationName({
      resolvedPlaceToken: 'resolved-token-1',
      incidentId: 'loc_original',
      confirmedHebrewName: 'הדולומיטים',
    })).resolves.toEqual(expect.objectContaining({
      resolvedPlaceToken: 'resolved-token-1',
      incidentId: 'loc_confirmed',
      place: expect.objectContaining({
        placeId: 'google-dolomites',
        resolvedPlaceToken: 'resolved-token-1',
        incidentId: 'loc_confirmed',
      }),
    }));
  });

  it('sends a route location bias through the shared Places callable', async () => {
    const callable = jest.fn(async () => ({ data: {
      predictions: [], sessionId: 'ps_hampi', expiresAt: 'later', incidentId: 'loc_hampi',
    } }));
    httpsCallable.mockReturnValue(callable);

    await searchPlaces('Virupaksha Temple', {
      locationBias: { lat: 15.335, lng: 76.46 },
    });

    expect(callable).toHaveBeenCalledWith({
      query: 'Virupaksha Temple', mode: 'places',
      locationBias: { lat: 15.335, lng: 76.46 },
    });
  });
});
