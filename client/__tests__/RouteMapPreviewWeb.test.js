import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RouteMapPreviewWeb from '../src/features/roadtrip/components/RouteMapPreview.web';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`) };
});

jest.mock('../src/components/NavigationChevron', () => () => null);

describe('RouteMapPreview web', () => {
  it('counts only precise points, reports hidden stops, and opens the selected day map', () => {
    const onPress = jest.fn();
    const screen = render(
      <RouteMapPreviewWeb
        stops={[
          { id: 'exact', locationPrecision: 'exact', place: { coordinates: { lat: 1, lng: 2 } } },
          { id: 'pin', locationPrecision: 'pin', coordinates: { lat: 3, lng: 4 } },
          { id: 'general', locationPrecision: 'general', coordinates: { lat: 5, lng: 6 } },
        ]}
        hiddenStopCount={1}
        onPress={onPress}
      />,
    );

    expect(screen.getByText('2 נקודות מדויקות · עצירה אחת לא מוצגת')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-map-preview'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
