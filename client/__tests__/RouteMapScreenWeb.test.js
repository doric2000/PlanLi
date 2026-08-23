import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RouteMapScreenWeb from '../src/features/roadtrip/screens/RouteMapScreen.web';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`) };
});

jest.mock('../src/components/CachedImage', () => () => null);

const routeData = {
  title: 'מסלול בצפון',
  days: [{
    stops: [
      { id: 'a', title: 'תצפית', locationPrecision: 'exact', place: { coordinates: { lat: 32.08, lng: 34.78 } } },
      { id: 'b', title: 'חוף', locationPrecision: 'exact', place: { coordinates: { lat: 32.18, lng: 34.88 } } },
    ],
  }, {
    stops: [
      { id: 'general', title: 'השוק בעיר', locationPrecision: 'general', destination: { cityName: 'חיפה' } },
      { id: 'c', title: 'מוזיאון', locationPrecision: 'exact', place: { coordinates: { lat: 31.9, lng: 34.7 } } },
    ],
  }],
};

describe('RouteMapScreen web', () => {
  it('keeps the Hebrew list in sync with the selected day and route segments', () => {
    const screen = render(
      <RouteMapScreenWeb route={{ params: { routeData } }} navigation={{ goBack: jest.fn() }} />,
    );

    expect(screen.getByText('יום 1 · 2 נקודות מדויקות')).toBeTruthy();
    expect(screen.getByText('פתיחת קטע 1 · עצירות 1–2')).toBeTruthy();
    expect(screen.getByText('תצפית')).toBeTruthy();
    expect(screen.queryByText('השוק בעיר')).toBeNull();

    fireEvent.press(screen.getByTestId('route-map-day-1'));

    expect(screen.getByText('יום 2 · נקודה מדויקת אחת')).toBeTruthy();
    expect(screen.getByText('עצירה אחת אינה מוצגת כי אין לה נקודה מדויקת.')).toBeTruthy();
    expect(screen.getByText('השוק בעיר')).toBeTruthy();
    expect(screen.queryByText('פתיחת קטע 1 · עצירות 1–2')).toBeNull();

    fireEvent.press(screen.getByTestId('route-map-all-days'));

    expect(screen.getByText('כל המסלול · 3 נקודות מדויקות')).toBeTruthy();
    expect(screen.queryByText(/פתיחת קטע/)).toBeNull();
  });
});
