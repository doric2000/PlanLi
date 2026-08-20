import React from 'react';
import { render } from '@testing-library/react-native';
import ExactLocationConfirmation from '../src/components/ExactLocationConfirmation';

jest.mock('../src/components/ExactLocationMapPreview', () => function MapPreview() {
  const { View } = require('react-native');
  return <View testID="mock-location-map" />;
});

test('exact-location confirmation exposes prepared English copy when requested', () => {
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
      onConfirm={jest.fn()}
      onChooseAnother={jest.fn()}
    />
  );

  expect(screen.getByTestId('mock-location-map')).toBeTruthy();
  expect(screen.getByText('Confirm location')).toBeTruthy();
  expect(screen.getByText('Choose another result')).toBeTruthy();
});
