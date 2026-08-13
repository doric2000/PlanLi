import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import RouteMapScreen from '../src/features/roadtrip/screens/RouteMapScreen';

const mockStartTracking = jest.fn(() => Promise.resolve(null));

jest.mock('react-native-maps');

jest.mock('../src/config/mapConfig', () => ({ USER_MAP_ZOOM: 15 }));

jest.mock('../src/hooks/useLiveUserLocation', () => ({
  useLiveUserLocation: () => ({
    location: { lat: 32.08, lng: 34.78, accuracy: 10 },
    status: 'granted',
    awaitingFirstFix: false,
    startTracking: mockStartTracking,
    stopTracking: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, ...props }) => ReactModule.createElement(View, props, children) };
});

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`) };
});

jest.mock('../src/components/CachedImage', () => () => null);

const routeData = {
  Title: 'Northern route',
  days: [{
    stops: [
      { id: 'a', title: 'First', place: { coordinates: { lat: 32.08, lng: 34.78 } } },
      { id: 'b', title: 'Second', place: { coordinates: { lat: 32.18, lng: 34.88 } } },
    ],
  }],
};

describe('RouteMapScreen', () => {
  beforeEach(() => mockStartTracking.mockClear());

  it('fits all numbered stops and can remount around the precise user location', async () => {
    const screen = render(
      <RouteMapScreen
        route={{ params: { routeData } }}
        navigation={{ goBack: jest.fn() }}
      />
    );
    await act(async () => {});

    expect(screen.getByText('Northern route')).toBeTruthy();
    expect(screen.getByTestId('route-map')).toBeTruthy();
    expect(screen.getByTestId('route-map').props.provider).toBe('google');
    expect(screen.queryByTestId('map-url-tile')).toBeNull();
    expect(screen.getByTestId('map-route-line')).toBeTruthy();
    expect(screen.getByTestId('map-user-accuracy')).toBeTruthy();
    expect(screen.getByTestId('route-stop-marker-1')).toBeTruthy();
    expect(screen.getByTestId('route-stop-marker-2')).toBeTruthy();
    expect(screen.getByTestId('route-map-marker-1').props.anchor).toEqual({
      x: 0.5,
      y: 50 / 64,
    });
    expect(StyleSheet.flatten(screen.getByTestId('route-map-controls').props.style)).toMatchObject({
      right: 14,
      bottom: 22,
    });

    fireEvent.press(screen.getByTestId('route-map-marker-2'));
    expect(screen.getByText('Second')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('route-map-controls').props.style)).toMatchObject({
      right: 14,
      top: 14,
    });
    expect(StyleSheet.flatten(screen.getByTestId('route-map-controls').props.style).bottom).toBeUndefined();

    fireEvent.press(screen.getByTestId('route-map-my-location'));
    const region = screen.getByTestId('route-map').props.initialRegion;
    expect(region.latitude).toBe(32.08);
    expect(region.longitude).toBe(34.78);
    expect(region.latitudeDelta).toBeCloseTo(360 / (2 ** 15));

    fireEvent.press(screen.getByTestId('route-map-fit-route'));
    const routeRegion = screen.getByTestId('route-map').props.initialRegion;
    expect(routeRegion.latitude).toBeCloseTo(32.13);
    expect(routeRegion.longitude).toBeCloseTo(34.83);
  });
});
