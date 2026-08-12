import { act, renderHook, waitFor } from '@testing-library/react-native';

import useExactPlaceSelection, { buildExactPlaceValue } from '../src/hooks/useExactPlaceSelection';

const mockResolve = jest.fn();
jest.mock('../src/services/LocationService', () => ({
  resolveDestinationForPlacePreview: (...args) => mockResolve(...args),
  searchPlaces: jest.fn(async () => []),
}));

const resolved = {
  destination: {
    country: { id: 'TH', name: 'Thailand' },
    city: { id: 'chiang-mai', name: 'Chiang Mai' },
  },
  place: { placeId: 'wat-doi-kham', name: 'Wat Phra That Doi Kham' },
};

describe('useExactPlaceSelection', () => {
  beforeEach(() => mockResolve.mockReset());

  it('owns the canonical exact-place value shared by both forms', () => {
    expect(buildExactPlaceValue(resolved.destination.country, resolved.destination.city, resolved.place)).toEqual({
      location: 'Chiang Mai',
      country: 'Thailand',
      countryId: 'TH',
      cityId: 'chiang-mai',
      place: resolved.place,
    });
  });

  it('clears a resolved selection when the user types again', async () => {
    mockResolve.mockResolvedValue(resolved);
    const onChange = jest.fn();
    const { result } = renderHook(() => useExactPlaceSelection({ onChange }));
    await act(async () => result.current.handleSelectGooglePlace('wat-doi-kham'));
    await waitFor(() => expect(result.current.selectedCity?.id).toBe('chiang-mai'));

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
});
