import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform, View } from 'react-native';

const mockFitToCoordinates = jest.fn();
const mockAnimateToRegion = jest.fn();

jest.mock('react-native-maps', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(({ children, ...props }, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({
        fitToCoordinates: mockFitToCoordinates,
        animateToRegion: mockAnimateToRegion,
      }));
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
  mockFitToCoordinates.mockClear();
  mockAnimateToRegion.mockClear();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});

test('iPhone renders a stable cached inline viewport and reports readiness without fitting one stop', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const select = jest.fn();
  const ready = jest.fn();
  const screen = render(<View style={{ height: 200 }}><TripPlannerMap
    stops={[{ id: 'stop-1', title: 'תצפית הכרמל', coordinates: { lat: 32.8, lng: 35 } }]}
    onSelectStop={select}
    onReady={ready}
    interactive={false}
  /></View>);
  const map = screen.getByTestId('trip-map');
  expect(map.props.provider).toBeUndefined();
  expect(map.props.loadingEnabled).toBe(true);
  expect(map.props.cacheEnabled).toBe(true);
  expect(map.props.scrollEnabled).toBe(false);
  expect(map.props.region).toEqual({ latitude: 32.8, longitude: 35, latitudeDelta: 0.06, longitudeDelta: 0.06 });
  expect(map.props.initialRegion).toBeUndefined();
  expect(mockFitToCoordinates).not.toHaveBeenCalled();
  fireEvent(map, 'mapReady');
  expect(ready).toHaveBeenCalledTimes(1);
  expect(mockFitToCoordinates).not.toHaveBeenCalled();
  const marker = screen.getByTestId('trip-marker-1. תצפית הכרמל');
  expect(marker.props.coordinate).toEqual({ latitude: 32.8, longitude: 35 });
  fireEvent(marker, 'press');
  expect(select).toHaveBeenCalledWith('stop-1');
});

test('coordinates are never fitted before the native map is ready', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const stops = [{ id: 'stop-1', title: 'תצפית הכרמל', coordinates: { lat: 32.8, lng: 35 } }];
  const screen = render(<TripPlannerMap stops={stops} />);
  expect(mockFitToCoordinates).not.toHaveBeenCalled();

  screen.rerender(<TripPlannerMap stops={[...stops, { id: 'stop-2', title: 'הנמל', coordinates: { lat: 32.82, lng: 34.99 } }]} />);
  expect(mockFitToCoordinates).not.toHaveBeenCalled();

  fireEvent(screen.getByTestId('trip-map'), 'mapReady');
  expect(mockFitToCoordinates).toHaveBeenCalledTimes(1);
});

test('region changes are forwarded without acting as a synthetic readiness event', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const ready = jest.fn();
  const regionChanged = jest.fn();
  const screen = render(<TripPlannerMap
    stops={[{ id: 'stop-1', title: 'תצפית הכרמל', coordinates: { lat: 32.8, lng: 35 } }]}
    onReady={ready}
    onRegionChange={regionChanged}
  />);
  const map = screen.getByTestId('trip-map');
  const region = { latitude: 32.8, longitude: 35, latitudeDelta: 0.06, longitudeDelta: 0.06 };
  fireEvent(map, 'regionChangeComplete', region, { isGesture: false });
  expect(ready).not.toHaveBeenCalled();
  expect(regionChanged).toHaveBeenCalledWith(region, { isGesture: false });

  fireEvent(map, 'mapReady');
  expect(ready).toHaveBeenCalledTimes(1);
});

test('camera failures cannot suppress native readiness', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  mockFitToCoordinates.mockImplementationOnce(() => { throw new Error('native camera unavailable'); });
  const ready = jest.fn();
  const screen = render(<TripPlannerMap
    stops={[
      { id: 'stop-1', coordinates: { lat: 32.8, lng: 35 } },
      { id: 'stop-2', coordinates: { lat: 32.82, lng: 34.99 } },
    ]}
    onReady={ready}
  />);
  expect(() => fireEvent(screen.getByTestId('trip-map'), 'mapReady')).not.toThrow();
  expect(ready).toHaveBeenCalledTimes(1);
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
  expect(map.props.onMapReady).toBeUndefined();
  expect(ready).not.toHaveBeenCalled();
  fireEvent(map, 'mapLoaded');
  expect(ready).toHaveBeenCalledTimes(1);
});
