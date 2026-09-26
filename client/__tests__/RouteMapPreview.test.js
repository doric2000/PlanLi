import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import RouteMapPreview from '../src/features/roadtrip/components/RouteMapPreview';

jest.mock('react-native-maps');
jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const originalPlatform = Platform.OS;
afterEach(() => { Platform.OS = originalPlatform; });
const stops = [0, 4, null, 4, 8].map((lat, stopIndex) => ({
  id: `stop-${stopIndex}`, title: `Stop ${stopIndex + 1}`, stopIndex,
  ...(lat === null ? { locationPrecision: 'general' } : { coordinates: { lat, lng: 0 } }),
}));

test.each(['ios', 'android'])('keeps separated preview lines safe and numbered on %s', (platform) => {
  Platform.OS = platform;
  const press = jest.fn();
  const screen = render(<RouteMapPreview stops={stops} onPress={press} hiddenStopCount={1} />);
  const lines = screen.getAllByTestId('map-route-line');
  expect(lines).toHaveLength(2);
  expect(lines.map((line) => line.props.coordinates)).toEqual([
    [{ latitude: 0, longitude: 0 }, { latitude: 4, longitude: 0 }],
    [{ latitude: 4, longitude: 0 }, { latitude: 8, longitude: 0 }],
  ]);
  const pattern = lines[0].props.lineDashPattern;
  if (platform === 'ios') {
    expect(2 * Math.ceil(445500 / Math.min(...pattern))).toBeLessThanOrEqual(512);
  } else {
    expect(pattern).toEqual([7, 7]);
  }
  expect(lines[1].props.lineDashPattern).toEqual(pattern);
  expect(screen.queryByTestId('route-map-preview-marker-3')).toBeNull();
  expect(screen.getByTestId('route-map-preview-marker-5')).toBeTruthy();
  fireEvent.press(screen.getByTestId('route-map-preview'));
  expect(press).toHaveBeenCalledTimes(1);
});
