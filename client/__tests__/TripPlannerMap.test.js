import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const mockSetCamera = jest.fn();
const mockBreadcrumb = jest.fn();
jest.mock('../src/components/CachedImage', () => {
  const { View } = require('react-native');
  return (props) => <View {...props} testID="marker-thumbnail" />;
});
jest.mock('expo-updates', () => ({ isEmbeddedLaunch: false, updateId: 'test-update', runtimeVersion: '1.3.0' }));
jest.mock('../src/services/ErrorReporting', () => ({
  addDiagnosticBreadcrumb: (...args) => mockBreadcrumb(...args),
  captureDiagnosticException: jest.fn(),
}));
jest.mock('react-native-maps', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(({ children, ...props }, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({ setCamera: mockSetCamera }));
      return ReactModule.createElement(View, { ...props, testID: 'trip-map' }, children);
    }),
    Marker: (props) => ReactModule.createElement(View, { ...props, testID: props.testID }),
    Polyline: (props) => ReactModule.createElement(View, { ...props, testID: 'trip-route-line' }),
    PROVIDER_GOOGLE: 'google',
  };
});

const TripPlannerMap = require('../src/features/tripPlanner/components/TripPlannerMap').default;
const TripPlannerMapCard = require('../src/features/tripPlanner/components/TripPlannerMapCard').default;
const stops = [
  { id: 'one', title: 'תצפית', coordinates: { lat: 32.8, lng: 35 } },
  { id: 'two', title: 'נמל', coordinates: { lat: 32.82, lng: 34.99 } },
];
const size = { width: 340, height: 142 };
const measureHost = (screen, layout = size) => fireEvent(screen.getByTestId('trip-map-host'), 'layout', { nativeEvent: { layout } });
const measureNative = (screen, layout = size) => fireEvent(screen.getByTestId('trip-map'), 'layout', { nativeEvent: { layout } });
const nativeReady = (screen) => fireEvent(screen.getByTestId('trip-map'), 'mapReady');
const load = (screen) => fireEvent(screen.getByTestId('trip-map'), 'mapLoaded');

beforeEach(() => jest.clearAllMocks());

test('mounts Google in a measured non-collapsible host with a finite camera', () => {
  const screen = render(<TripPlannerMap stops={stops} interactive={false} />);
  expect(screen.queryByTestId('trip-map')).toBeNull();
  expect(screen.getByTestId('trip-map-host').props.collapsable).toBe(false);
  expect(StyleSheet.flatten(screen.getByTestId('trip-map-host').props.style)).toEqual(expect.objectContaining({
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
  }));
  measureHost(screen, { width: 340, height: 0 });
  expect(screen.queryByTestId('trip-map')).toBeNull();
  measureHost(screen);
  const map = screen.getByTestId('trip-map');
  expect(map.props.provider).toBe('google');
  expect(StyleSheet.flatten(map.props.style)).toEqual({ flex: 1 });
  expect(map.props.initialRegion).toBeUndefined();
  expect(map.props.cacheEnabled).toBeUndefined();
  expect(map.props.loadingEnabled).toBeUndefined();
  expect(map.props.scrollEnabled).toBe(false);
  expect(map.props.initialCamera.center.latitude).toBeCloseTo(32.81);
  expect(Number.isFinite(map.props.initialCamera.zoom)).toBe(true);
  expect(mockSetCamera).not.toHaveBeenCalled();
});

test.each(['layout-first', 'ready-first'])('initializes once before tiles, with %s event order', (order) => {
  const ready = jest.fn();
  const screen = render(<TripPlannerMap stops={stops} onReady={ready} deferOverlaysUntilLoaded />);
  measureHost(screen);
  (order === 'layout-first' ? measureNative : nativeReady)(screen);
  expect(mockSetCamera).not.toHaveBeenCalled();
  (order === 'layout-first' ? nativeReady : measureNative)(screen);
  expect(mockSetCamera).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled();
  expect(screen.queryByTestId('trip-route-line')).toBeNull();
  expect(screen.queryByTestId('trip-map-marker-one')).toBeNull();
  load(screen);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('trip-route-line')).toBeTruthy();
  expect(screen.getByTestId('trip-map-marker-one')).toBeTruthy();
});

test('one-stop inline maps also initialize before tiles without fitting bounds', () => {
  const screen = render(<TripPlannerMap stops={[stops[0]]} interactive={false} />);
  measureHost(screen); measureNative(screen); nativeReady(screen);
  expect(mockSetCamera).toHaveBeenCalledWith(expect.objectContaining({ center: { latitude: 32.8, longitude: 35 } }));
  expect(screen.queryByTestId('trip-route-line')).toBeNull();
});

test('retains an early tile event until layout and native readiness arrive', () => {
  const ready = jest.fn();
  const screen = render(<TripPlannerMap stops={stops} onReady={ready} />);
  measureHost(screen); load(screen); measureNative(screen);
  expect(ready).not.toHaveBeenCalled();
  nativeReady(screen);
  expect(ready).toHaveBeenCalledTimes(1);
});

test('region changes do not imply readiness and repeated tile events never refit', () => {
  const ready = jest.fn();
  const changed = jest.fn();
  const screen = render(<TripPlannerMap stops={stops} onReady={ready} onRegionChange={changed} />);
  measureHost(screen); measureNative(screen); nativeReady(screen);
  const region = { latitude: 32.8, longitude: 35, latitudeDelta: 0.06, longitudeDelta: 0.06 };
  fireEvent(screen.getByTestId('trip-map'), 'regionChangeComplete', region, { isGesture: false });
  expect(changed).toHaveBeenCalledWith(region, { isGesture: false });
  expect(ready).not.toHaveBeenCalled();
  load(screen); load(screen); nativeReady(screen); measureNative(screen);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(mockSetCamera).toHaveBeenCalledTimes(1);
});

test('updates an inline camera for changed coordinates but not selection', () => {
  const select = jest.fn();
  const screen = render(<TripPlannerMap stops={stops} interactive={false} onSelectStop={select} />);
  measureHost(screen); measureNative(screen); nativeReady(screen); load(screen);
  const updated = [...stops, { id: 'three', coordinates: { lat: 32.9, lng: 34.98 } }];
  screen.rerender(<TripPlannerMap stops={updated} interactive={false} onSelectStop={select} />);
  expect(mockSetCamera).toHaveBeenCalledTimes(2);
  screen.rerender(<TripPlannerMap stops={[...updated]} selectedStopId="one" interactive={false} onSelectStop={select} />);
  expect(mockSetCamera).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByTestId('trip-map-marker-one'));
  expect(select).toHaveBeenCalledWith('one');
});

test('waits for the native frame to match a changed host size', () => {
  const screen = render(<TripPlannerMap stops={stops} />);
  measureHost(screen); measureNative(screen); nativeReady(screen); load(screen);
  const rotatedSize = { width: 700, height: 350 };
  measureHost(screen, rotatedSize);
  expect(mockSetCamera).toHaveBeenCalledTimes(1);
  measureNative(screen, rotatedSize);
  expect(mockSetCamera).toHaveBeenCalledTimes(2);
});

test('ignores native callbacks after unmount', () => {
  const ready = jest.fn();
  const screen = render(<TripPlannerMap stops={stops} onReady={ready} />);
  measureHost(screen);
  const callbacks = screen.getByTestId('trip-map').props;
  screen.unmount();
  callbacks.onMapReady(); callbacks.onMapLoaded(); callbacks.onLayout({ nativeEvent: { layout: size } });
  expect(mockSetCamera).not.toHaveBeenCalled();
  expect(ready).not.toHaveBeenCalled();
});

test('a failed native camera command does not report successful initialization', () => {
  mockSetCamera.mockImplementationOnce(() => { throw new Error('camera unavailable'); });
  const ready = jest.fn();
  const stage = jest.fn();
  const screen = render(<TripPlannerMap stops={stops} onReady={ready} onStageChange={stage} />);
  measureHost(screen); measureNative(screen); nativeReady(screen); load(screen);
  expect(ready).not.toHaveBeenCalled();
  expect(stage).toHaveBeenCalledWith('camera_failed');
});

test('diagnostics identify layout and OTA without stop names or coordinates', () => {
  const screen = render(<TripPlannerMap stops={stops} />);
  measureHost(screen); measureNative(screen); nativeReady(screen);
  const diagnostics = JSON.stringify(mockBreadcrumb.mock.calls);
  expect(diagnostics).toContain('test-update');
  expect(diagnostics).toContain('340x142');
  expect(diagnostics).not.toContain('32.8');
  expect(diagnostics).not.toContain('תצפית');
});

test('the real card only clears loading when its measured native map reports tiles', () => {
  const screen = render(<TripPlannerMapCard stops={stops} />);
  expect(screen.getByTestId('trip-map-loading')).toBeTruthy();
  measureHost(screen); measureNative(screen); nativeReady(screen);
  expect(screen.getByTestId('trip-map-loading')).toBeTruthy();
  expect(screen.queryByTestId('trip-route-line')).toBeNull();
  load(screen);
  expect(screen.queryByTestId('trip-map-loading')).toBeNull();
  expect(screen.getByTestId('trip-route-line')).toBeTruthy();
});

test('direct map consumers retain markers and routes when tiles have not loaded', () => {
  const ready = jest.fn();
  const select = jest.fn();
  const screen = render(<TripPlannerMap stops={stops} onReady={ready} onSelectStop={select} />);
  measureHost(screen); measureNative(screen); nativeReady(screen);
  expect(ready).not.toHaveBeenCalled();
  expect(screen.getByTestId('trip-route-line')).toBeTruthy();
  fireEvent.press(screen.getByTestId('trip-map-marker-one'));
  expect(select).toHaveBeenCalledWith('one');
});

test('uses the Roadtrip numbered/photo pins without native callouts and preserves list numbers across gaps and reorders', () => {
  const select = jest.fn();
  const mapPress = jest.fn();
  const photoStop = { ...stops[1], media: [{ thumb: { url: 'https://example.test/thumb.jpg' } }] };
  const withGap = [stops[0], { id: 'general', title: 'מנוחה', locationMode: 'general' }, photoStop];
  const screen = render(<TripPlannerMap stops={withGap} selectedStopId="two" onSelectStop={select} onMapPress={mapPress} />);
  measureHost(screen); measureNative(screen); nativeReady(screen); load(screen);
  expect(screen.getByTestId('route-stop-marker-1')).toBeTruthy();
  expect(screen.queryByTestId('route-stop-marker-2')).toBeNull();
  expect(screen.getByLabelText('עצירה 3: נמל').props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId('marker-thumbnail').props.source.uri).toBe('https://example.test/thumb.jpg');
  const pin = screen.getByTestId('trip-map-marker-two');
  expect(pin.props.title).toBeUndefined();
  expect(pin.props.description).toBeUndefined();
  expect(pin.props.pinColor).toBeUndefined();
  expect(pin.props.anchor).toEqual({ x: 0.5, y: 50 / 64 });
  expect(pin.props.stopPropagation).toBe(true);
  expect(pin.props.zIndex).toBeGreaterThan(screen.getByTestId('trip-map-marker-one').props.zIndex);
  fireEvent.press(pin);
  expect(select).toHaveBeenCalledWith('two');
  expect(mapPress).not.toHaveBeenCalled();

  screen.rerender(<TripPlannerMap stops={[photoStop, withGap[1], stops[0]]} selectedStopId="two" onSelectStop={select} />);
  expect(screen.getByLabelText('עצירה 1: נמל').props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText('עצירה 3: תצפית')).toBeTruthy();
  expect(mockSetCamera).toHaveBeenCalledTimes(1);
});

test('inline previews use the same compact numbered pins as Roadtrip previews', () => {
  const screen = render(<TripPlannerMap stops={stops} interactive={false} />);
  measureHost(screen);
  expect(screen.getByTestId('trip-map-marker-one').props.anchor).toEqual({ x: 0.5, y: 39 / 50 });
  expect(StyleSheet.flatten(screen.getByTestId('route-stop-marker-1').props.style)).toMatchObject({ width: 44, height: 50 });
});
