import React from 'react';
import { Alert, Linking, Modal } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import OpenWithLocationSheet from '../src/components/OpenWithLocationSheet';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }) => ReactModule.createElement(Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));

describe('OpenWithLocationSheet', () => {
  const place = {
    placeId: 'google-place-1',
    name: 'Hotel Liro',
    coordinates: { lat: 40.4012, lng: 19.4811 },
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('offers Google Maps and Waze using the saved exact identity and coordinates', async () => {
    const onClose = jest.fn();
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    const screen = render(
      <OpenWithLocationSheet
        visible
        onClose={onClose}
        place={place}
        destination={{ cityName: 'ולורה', countryName: 'אלבניה' }}
      />
    );

    expect(screen.getByText('פתיחה באמצעות')).toBeTruthy();
    expect(screen.getByText('Google Maps')).toBeTruthy();
    expect(screen.getByText('Waze')).toBeTruthy();

    fireEvent.press(screen.getByTestId('open-with-location-google'));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=40.4012%2C19.4811&query_place_id=google-place-1'
    ));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('open-with-location-waze'));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(
      'https://waze.com/ul?ll=40.4012%2C19.4811&navigate=yes&utm_source=planli'
    ));
  });

  it('omits Waze for a legacy place without coordinates while keeping Google available', () => {
    const screen = render(
      <OpenWithLocationSheet
        visible
        onClose={jest.fn()}
        place={{ name: 'Legacy hotel', address: 'Old Road' }}
        destination={{ cityName: 'ולורה', countryName: 'אלבניה' }}
      />
    );

    expect(screen.getByTestId('open-with-location-google')).toBeTruthy();
    expect(screen.queryByTestId('open-with-location-waze')).toBeNull();
  });

  it('dismisses from the backdrop and close control', () => {
    const onClose = jest.fn();
    const screen = render(
      <OpenWithLocationSheet visible onClose={onClose} place={place} />
    );

    fireEvent.press(screen.getByTestId('open-with-location-close'));
    fireEvent.press(screen.getByTestId('open-with-location-backdrop'));
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows a Hebrew error when the selected provider cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('unavailable'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = render(
      <OpenWithLocationSheet visible onClose={jest.fn()} place={place} />
    );

    fireEvent.press(screen.getByTestId('open-with-location-waze'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'לא ניתן לפתוח את המפה',
      'לא הצלחנו לפתוח את Waze. אפשר לנסות שוב.'
    ));
  });
});
