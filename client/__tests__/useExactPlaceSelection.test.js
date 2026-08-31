import { act, renderHook, waitFor } from '@testing-library/react-native';

import useExactPlaceSelection, { buildExactPlaceValue } from '../src/hooks/useExactPlaceSelection';

const mockResolve = jest.fn();
const mockFinalize = jest.fn();
const mockSearch = jest.fn(async () => []);
jest.mock('../src/services/LocationService', () => ({
  finalizeDestinationChoice: (...args) => mockFinalize(...args),
  resolveDestinationForPlacePreview: (...args) => mockResolve(...args),
  searchPlaces: (...args) => mockSearch(...args),
}));

const resolved = {
  destination: {
    country: { id: 'TH', name: 'Thailand' },
    city: { id: 'chiang-mai', name: 'Chiang Mai' },
  },
  place: { placeId: 'wat-doi-kham', name: 'Wat Phra That Doi Kham' },
};

describe('useExactPlaceSelection', () => {
  beforeEach(() => {
    mockResolve.mockReset();
    mockFinalize.mockReset();
    mockSearch.mockClear();
  });

  it('owns the canonical exact-place value shared by both forms', () => {
    expect(buildExactPlaceValue(resolved.destination.country, resolved.destination.city, resolved.place)).toEqual({
      location: 'Chiang Mai',
      country: 'Thailand',
      countryId: 'TH',
      cityId: 'chiang-mai',
      destination: {
        countryId: 'TH',
        cityId: 'chiang-mai',
        countryName: 'Thailand',
        cityName: 'Chiang Mai',
      },
      place: resolved.place,
    });
  });

  it('publishes a resolved selection only after map confirmation', async () => {
    mockResolve.mockResolvedValue(resolved);
    const onChange = jest.fn();
    const { result } = renderHook(() => useExactPlaceSelection({ onChange }));
    await act(async () => result.current.handleSelectGooglePlace('wat-doi-kham'));
    await waitFor(() => expect(result.current.pendingLocation?.cityId).toBe('chiang-mai'));

    expect(result.current.selectedCity).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    act(() => result.current.confirmPendingLocation());
    expect(result.current.selectedCity?.id).toBe('chiang-mai');
    expect(result.current.selectedPlace?.placeId).toBe('wat-doi-kham');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cityId: 'chiang-mai' }));
  });

  it('can auto-confirm an unambiguous place for the single-page composer', async () => {
    mockResolve.mockResolvedValue(resolved);
    const onChange = jest.fn();
    const { result } = renderHook(() => useExactPlaceSelection({ onChange }));

    await act(async () => result.current.handleSelectGooglePlace('wat-doi-kham', { autoConfirm: true }));

    expect(result.current.pendingLocation).toBeNull();
    expect(result.current.selectedCity?.id).toBe('chiang-mai');
    expect(result.current.selectedPlace?.placeId).toBe('wat-doi-kham');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'chiang-mai' }));
  });

  it('clears a confirmed selection while the user searches for a replacement', async () => {
    mockResolve.mockResolvedValue(resolved);
    const onChange = jest.fn();
    const { result } = renderHook(() => useExactPlaceSelection({ onChange }));
    await act(async () => result.current.handleSelectGooglePlace('wat-doi-kham'));
    act(() => result.current.confirmPendingLocation());

    act(() => result.current.clearSelectionForTyping('Wat Phra'));
    expect(result.current.selectedCity).toBeNull();
    expect(result.current.selectedPlace).toBeNull();
    expect(result.current.resolvingLocation).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores a stale place response after further typing', async () => {
    let resolveRequest;
    mockResolve.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const { result } = renderHook(() => useExactPlaceSelection());
    let pending;
    act(() => { pending = result.current.handleSelectGooglePlace('wat-doi-kham'); });
    act(() => result.current.clearSelectionForTyping('new query'));
    await act(async () => { resolveRequest(resolved); await pending; });
    expect(result.current.locationQuery).toBe('new query');
    expect(result.current.selectedPlace).toBeNull();
  });

  it('keeps a non-retryable resolution error visible for choosing another result', async () => {
    mockResolve.mockRejectedValue(Object.assign(new Error('Expired selection'), {
      code: 'functions/failed-precondition',
      details: { reason: 'selection-expired', retryable: false, incidentId: 'loc_expired123' },
    }));
    const { result } = renderHook(() => useExactPlaceSelection());

    await act(async () => {
      await expect(result.current.handleSelectGooglePlace('expired-selection')).rejects.toBeTruthy();
    });

    expect(result.current.locationResolveError).toContain('pired123');
    expect(result.current.locationResolveRetryable).toBe(false);
  });

  it('finalizes an ambiguous destination choice without repeating place resolution', async () => {
    mockResolve.mockResolvedValue({
      status: 'destination_choice_required',
      resolutionId: 'dcr_12345678',
      incidentId: 'loc_1234567890ab',
      place: { placeId: 'hotel', name: 'Hotel', coordinates: { lat: 19.8, lng: 99.8 } },
      alternatives: [{ destinationChoiceId: 'dc_12345678', cityName: 'Chiang Rai' }],
    });
    mockFinalize.mockResolvedValue(resolved);
    const { result } = renderHook(() => useExactPlaceSelection());

    await act(async () => result.current.handleSelectGooglePlace('hotel'));
    expect(result.current.destinationChoice?.resolutionId).toBe('dcr_12345678');
    expect(result.current.pendingLocation?.place?.placeId).toBe('hotel');
    await act(async () => result.current.chooseDestination('dc_12345678'));

    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(mockFinalize).toHaveBeenCalledWith({
      resolutionId: 'dcr_12345678',
      destinationChoiceId: 'dc_12345678',
      incidentId: 'loc_1234567890ab',
    });
    expect(result.current.pendingLocation?.cityId).toBe('chiang-mai');
  });

  it('recovers an expired search session from the durable provider Place ID', async () => {
    mockResolve
      .mockRejectedValueOnce(Object.assign(new Error('expired'), {
        code: 'functions/deadline-exceeded', details: { reason: 'selection_expired' },
      }))
      .mockResolvedValueOnce(resolved);
    const selection = {
      sessionId: 'ps_expired', selectionId: 'sel_expired',
      providerPlaceId: 'wat-doi-kham', description: 'Wat Phra That Doi Kham',
    };
    const { result } = renderHook(() => useExactPlaceSelection());

    await act(async () => result.current.handleSelectGooglePlace(selection));

    expect(mockResolve).toHaveBeenCalledTimes(2);
    expect(mockResolve.mock.calls[1][0]).toEqual(expect.objectContaining({
      provider: 'google', providerPlaceId: 'wat-doi-kham', place_id: 'wat-doi-kham',
    }));
    expect(result.current.pendingLocation?.place?.placeId).toBe('wat-doi-kham');
  });

  it('attaches the exact place to a user-selected fallback destination', async () => {
    mockResolve.mockResolvedValue({
      status: 'destination_choice_required',
      resolutionId: 'dcr_fallback1',
      incidentId: 'loc_fallback123',
      alternatives: [],
      allowDestinationSearch: true,
    });
    mockFinalize.mockResolvedValue(resolved);
    const { result } = renderHook(() => useExactPlaceSelection());

    await act(async () => result.current.handleSelectGooglePlace('lake-carezza'));
    await act(async () => result.current.chooseFallbackDestination({
      countryId: 'IT', cityId: 'dolomites', resolvedPlaceToken: 'destination-token',
    }));

    expect(mockFinalize).toHaveBeenCalledWith({
      resolutionId: 'dcr_fallback1',
      incidentId: 'loc_fallback123',
      destinationResolvedPlaceToken: 'destination-token',
    });
    expect(result.current.pendingLocation?.cityId).toBe('chiang-mai');
  });

  it('quietly finalizes the preferred route destination when geometry accepts it', async () => {
    mockResolve.mockResolvedValue({
      status: 'destination_choice_required',
      resolutionId: 'dcr_hampi123',
      incidentId: 'loc_hampi12345',
      place: { placeId: 'virupaksha', name: 'Virupaksha Temple' },
      alternatives: [],
    });
    mockFinalize.mockResolvedValue({
      destination: {
        country: { id: 'IN', name: 'הודו' },
        city: { id: 'hampi', name: 'האמפי' },
      },
      place: { placeId: 'virupaksha', name: 'Virupaksha Temple' },
    });
    const preferredDestination = {
      countryId: 'IN', cityId: 'hampi', coordinates: { lat: 15.335, lng: 76.46 },
    };
    const { result } = renderHook(() => useExactPlaceSelection({ preferredDestination }));

    await act(async () => result.current.handleSelectGooglePlace('virupaksha'));

    expect(mockFinalize).toHaveBeenCalledWith({
      resolutionId: 'dcr_hampi123',
      incidentId: 'loc_hampi12345',
      destinationRef: { countryId: 'IN', cityId: 'hampi' },
    });
    expect(result.current.destinationChoice).toBeNull();
    expect(result.current.pendingLocation?.cityId).toBe('hampi');
  });

  it('keeps the existing picker when the preferred route destination is rejected', async () => {
    const choice = {
      status: 'destination_choice_required', resolutionId: 'dcr_farplace',
      incidentId: 'loc_farplace123', place: { placeId: 'udupi' }, alternatives: [],
    };
    mockResolve.mockResolvedValue(choice);
    mockFinalize.mockRejectedValue(new Error('destination_outside_bounds'));
    const { result } = renderHook(() => useExactPlaceSelection({
      preferredDestination: { countryId: 'IN', cityId: 'hampi' },
    }));

    await act(async () => result.current.handleSelectGooglePlace('udupi'));

    expect(result.current.destinationChoice?.resolutionId).toBe('dcr_farplace');
    expect(result.current.locationResolveError).toBeNull();
  });

  it('biases every exact-place search to the preferred destination center', async () => {
    const { result } = renderHook(() => useExactPlaceSelection({
      preferredDestination: { coordinates: { lat: 15.335, lng: 76.46 } },
    }));
    await act(async () => result.current.googleSearchFn('Virupaksha', { signal: null }));
    expect(mockSearch).toHaveBeenCalledWith('Virupaksha', {
      signal: null,
      types: 'all',
      locationBias: { lat: 15.335, lng: 76.46 },
    });
  });

  it('does not turn missing preferred coordinates into a zero-zero bias', async () => {
    const { result } = renderHook(() => useExactPlaceSelection({
      preferredDestination: { coordinates: { lat: null, lng: null } },
    }));
    await act(async () => result.current.googleSearchFn('Somewhere', {}));
    expect(mockSearch).toHaveBeenCalledWith('Somewhere', {
      types: 'all', locationBias: null,
    });
  });
});
