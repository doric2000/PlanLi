import { httpsCallable } from 'firebase/functions';

import {
  confirmProvisionalDestinationName,
  searchCities,
  searchPlaces,
  searchDestinationChoices,
  resolveDestinationForPlacePreview,
} from '../src/services/LocationService';
import { resolveRecommendationDestination } from '../src/services/RecommendationService';
import { searchDestinations } from '../src/services/DestinationService';
jest.mock('../src/services/DestinationService', () => ({ searchDestinations: jest.fn() }));

const mockGateway = jest.fn();
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => mockGateway) }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('../src/services/RecommendationService', () => ({
  resolveRecommendationDestination: jest.fn(),
}));

describe('LocationService search guards', () => {
  beforeEach(() => { jest.clearAllMocks(); mockGateway.mockReset(); });

  it('keeps catalog destinations available when the provider search fails', async () => {
    searchDestinations.mockResolvedValue({ items: [{ countryId: 'LK', cityId: 'ella', names: { he: 'אלה' } }] });
    mockGateway.mockRejectedValueOnce(new Error('unavailable'));
    const results = await searchDestinationChoices('Ella', { countryId: 'LK' });
    expect(searchDestinations).toHaveBeenCalledWith({ query: 'Ella', countryId: 'LK', limit: 10 });
    expect(results[0].destinationRef).toEqual({ countryId: 'LK', cityId: 'ella' });
  });

  it('enables destination recovery on a durable Place ID without a search session', async () => {
    resolveRecommendationDestination.mockResolvedValue({ status: 'destination_choice_required' });
    await resolveDestinationForPlacePreview('durable-id');
    expect(resolveRecommendationDestination).toHaveBeenCalledWith(expect.objectContaining({
      placeId: 'durable-id', supportsDestinationChoice: true, supportsDestinationSearch: true,
    }));
  });

  it('delivers verified catalog results before a slow provider finishes', async () => {
    let finishProvider;
    mockGateway.mockReturnValueOnce(new Promise((resolve) => { finishProvider = resolve; }));
    searchDestinations.mockResolvedValue({ items: [{ countryId: 'LK', cityId: 'ella', names: { he: 'אלה' } }] });
    const onResults = jest.fn();
    let finished = false;
    const search = searchDestinationChoices('Ella', { countryId: 'LK', onResults }).then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    expect(onResults).toHaveBeenCalledWith([expect.objectContaining({ destinationRef: { countryId: 'LK', cityId: 'ella' } })]);
    expect(finished).toBe(false);
    finishProvider({ data: { predictions: [] } });
    expect(await search).toHaveLength(1);
  });

  it('normalizes a recovered prediction and retains its newly verified token for publishing', async () => {
    resolveRecommendationDestination.mockResolvedValue({ status: 'resolved', resolvedPlaceToken: 'fresh-token',
      place: { placeId: 'durable-id' } });
    const result = await resolveDestinationForPlacePreview({ providerPlaceId: 'durable-id', place_id: 'durable-id' });
    expect(resolveRecommendationDestination).toHaveBeenCalledWith(expect.objectContaining({ placeId: 'durable-id' }));
    expect(result.place.resolvedPlaceToken).toBe('fresh-token');
  });

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
    const callable = mockGateway.mockResolvedValue({ data: {
      predictions: [], sessionId: 'ps_hampi', expiresAt: 'later', incidentId: 'loc_hampi',
    } });

    await searchPlaces('Virupaksha Temple', {
      locationBias: { lat: 15.335, lng: 76.46 },
    });

    expect(callable).toHaveBeenCalledWith({
      query: 'Virupaksha Temple', mode: 'places',
      locationBias: { lat: 15.335, lng: 76.46 },
    });
  });
});
