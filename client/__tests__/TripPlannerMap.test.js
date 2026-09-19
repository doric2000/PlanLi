import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform, View } from 'react-native';

jest.mock('react-native-maps', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(({ children, ...props }, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({ fitToCoordinates: jest.fn() }));
      return ReactModule.createElement(NativeView, { ...props, testID: 'trip-map' }, children);
    }),
    Marker: (props) => ReactModule.createElement(NativeView, { ...props, testID: `trip-marker-${props.title}` }),
    Polyline: (props) => ReactModule.createElement(NativeView, { ...props, testID: 'trip-route-line' }),
    PROVIDER_GOOGLE: 'google',
  };
});

const TripPlannerMap = require('../src/features/tripPlanner/components/TripPlannerMap').default;
const originalPlatform = Platform.OS;

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});

test('iPhone uses Apple Maps and reports readiness from the native ready event', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const select = jest.fn();
  const ready = jest.fn();
  const screen = render(<View style={{ height: 200 }}><TripPlannerMap
    stops={[{ id: 'stop-1', title: 'תצפית הכרמל', coordinates: { lat: 32.8, lng: 35 } }]}
    onSelectStop={select}
    onReady={ready}
  /></View>);
  const map = screen.getByTestId('trip-map');
  expect(map.props.provider).toBeUndefined();
  fireEvent(map, 'mapReady');
  expect(ready).toHaveBeenCalledTimes(1);
  const marker = screen.getByTestId('trip-marker-1. תצפית הכרמל');
  expect(marker.props.coordinate).toEqual({ latitude: 32.8, longitude: 35 });
  fireEvent(marker, 'press');
  expect(select).toHaveBeenCalledWith('stop-1');
});

test('Android keeps Google Maps and waits for map tiles before reporting readiness', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const ready = jest.fn();
  const screen = render(<TripPlannerMap
    stops={[{ id: 'stop-1', title: 'תצפית הכרמל', coordinates: { lat: 32.8, lng: 35 } }]}
    onReady={ready}
  />);
  const map = screen.getByTestId('trip-map');
  expect(map.props.provider).toBe('google');
  fireEvent(map, 'mapReady');
  expect(ready).not.toHaveBeenCalled();
  fireEvent(map, 'mapLoaded');
  expect(ready).toHaveBeenCalledTimes(1);
});
