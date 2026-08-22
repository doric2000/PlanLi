import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import SingleDestinationPicker from '../src/features/community/components/SingleDestinationPicker';

const mockSearchCities = jest.fn();
const mockResolveDestination = jest.fn();
const mockFinalizeDestination = jest.fn();
let mockOptions = [];

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => <Text>{name}</Text> };
});
jest.mock('../src/hooks/useDestinationFilterOptions', () => ({
  useDestinationFilterOptions: () => ({
    options: mockOptions,
    loading: false,
    searchLoading: false,
    searchError: '',
    retrySearch: jest.fn(),
  }),
}));
jest.mock('../src/services/LocationService', () => ({
  searchCities: (...args) => mockSearchCities(...args),
  resolveDestinationForPlacePreview: (...args) => mockResolveDestination(...args),
  finalizeDestinationChoice: (...args) => mockFinalizeDestination(...args),
}));

describe('SingleDestinationPicker provider fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockOptions = [];
    mockSearchCities.mockResolvedValue([{
      selectionId: 'selection-1',
      providerPlaceId: 'google-city-1',
      structured_formatting: { main_text: 'לובליאנה', secondary_text: 'סלובניה' },
    }]);
    mockResolveDestination.mockResolvedValue({
      status: 'resolved',
      resolvedPlaceToken: 'resolved-token-1',
      destination: {
        country: { id: 'SI', name: 'סלובניה' },
        city: { id: 'ljubljana', name: 'לובליאנה', coordinates: { lat: 46.05, lng: 14.5 } },
      },
      place: { placeId: 'google-city-1', resolvedPlaceToken: 'resolved-token-1' },
    });
  });

  afterEach(() => jest.useRealTimers());

  it('offers and preserves a server-verified destination that is not yet in PlanLi', async () => {
    const onChange = jest.fn();
    const screen = render(
      <SingleDestinationPicker allowProviderDestinations value={null} onChange={onChange} />
    );
    const input = screen.getByTestId('recommendation-destination-search');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'לובליאנה');
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('recommendation-destination-provider-option-0')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-destination-provider-option-0'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      countryId: 'SI',
      cityId: 'ljubljana',
      provider: 'google',
      providerPlaceId: 'google-city-1',
      resolvedPlaceToken: 'resolved-token-1',
    })));
  });

  it('does not call Google when an active PlanLi destination matches', async () => {
    mockOptions = [{
      key: 'city:HU:budapest', kind: 'city', countryId: 'HU', cityId: 'budapest',
      name: 'בודפשט', countryName: 'הונגריה',
    }];
    const screen = render(
      <SingleDestinationPicker allowProviderDestinations value={null} onChange={jest.fn()} />
    );
    const input = screen.getByTestId('recommendation-destination-search');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'בודפשט');
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(screen.getByTestId('recommendation-destination-option-HU-budapest')).toBeTruthy();
    expect(mockSearchCities).not.toHaveBeenCalled();
  });
});
