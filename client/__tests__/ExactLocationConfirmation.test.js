import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ExactLocationConfirmation from '../src/components/ExactLocationConfirmation';

jest.mock('../src/components/ExactLocationMapPreview', () => function MapPreview() {
  const { View } = require('react-native');
  return <View testID="mock-location-map" />;
});
jest.mock('../src/components/DestinationFallbackPicker', () => function DestinationFallbackPicker({ onSelect }) {
  const { TouchableOpacity, Text } = require('react-native');
  return (
    <TouchableOpacity
      testID="mock-destination-fallback"
      onPress={() => onSelect({ countryId: 'IT', cityId: 'dolomites' })}
    >
      <Text>Fallback picker</Text>
    </TouchableOpacity>
  );
});

test('exact-location confirmation exposes prepared English copy when requested', () => {
  const onConfirm = jest.fn();
  const screen = render(
    <ExactLocationConfirmation
      locale="en"
      pendingLocation={{
        location: 'Vlorë',
        country: 'Albania',
        place: {
          placeId: 'hotel-liro',
          name: 'Hotel Liro',
          address: 'Rruga Aleksandër Moisiu, Vlorë',
          coordinates: { lat: 40.4146, lng: 19.4812 },
        },
      }}
      onConfirm={onConfirm}
      onChooseAnother={jest.fn()}
    />
  );

  expect(screen.getByTestId('mock-location-map')).toBeTruthy();
  expect(screen.getByText('Confirm location')).toBeTruthy();
  expect(screen.getByText('Choose another result')).toBeTruthy();
  expect(screen.getByTestId('exact-location-confirm').props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getByTestId('exact-location-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('exact-location confirmation renders copy and controls before place resolution or map readiness', () => {
  const screen = render(
    <ExactLocationConfirmation
      resolving
      resolvingPreview={{ description: 'Café Central, Vienna' }}
      onConfirm={jest.fn()}
      onChooseAnother={jest.fn()}
    />
  );
  expect(screen.getByText('Café Central, Vienna')).toBeTruthy();
  expect(screen.getByTestId('exact-location-resolving-shell')).toBeTruthy();
  expect(screen.getByTestId('exact-location-confirm').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('exact-location-map-skeleton')).toBeTruthy();
  expect(screen.queryByTestId('mock-location-map')).toBeNull();
});

test('exact-location confirmation offers destination search instead of an error', () => {
  const onChooseFallbackDestination = jest.fn();
  const screen = render(
    <ExactLocationConfirmation
      destinationChoice={{
        resolutionId: 'dcr_fallback1', alternatives: [], allowDestinationSearch: true,
      }}
      onChooseFallbackDestination={onChooseFallbackDestination}
      onChooseAnother={jest.fn()}
    />
  );
  fireEvent.press(screen.getByTestId('mock-destination-fallback'));
  expect(onChooseFallbackDestination).toHaveBeenCalledWith({ countryId: 'IT', cityId: 'dolomites' });
});
