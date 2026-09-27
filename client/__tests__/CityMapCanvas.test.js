import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CityMapCanvas from '../src/features/destination/components/CityMapCanvas';
import { createDestinationStyles } from '../src/features/destination/components/destinationStyles';
const mockSetCamera = jest.fn();
jest.mock('react-native-maps', () => {
  const React = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ setCamera: mockSetCamera })); return <View {...props} />; }), Marker: View, PROVIDER_GOOGLE: 'google' };
});
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: Object.assign(() => null, { loadFont: async () => {} }) }));
test('waits for positive layout and native readiness before applying a finite camera', async () => {
  const onReady = jest.fn();
  const screen = render(<CityMapCanvas region={{ latitude: 6.8, longitude: 81.8, latitudeDelta: 0.04, longitudeDelta: 0.04 }} items={[]}
    styles={createDestinationStyles()} onReady={onReady} />);
  expect(screen.queryByTestId('city-map-native')).toBeNull();
  fireEvent(screen.getByTestId('city-map-host'), 'layout', { nativeEvent: { layout: { width: 358, height: 220 } } });
  const map = screen.getByTestId('city-map-native');
  expect(map.props.initialCamera.zoom).toBeGreaterThan(0);
  expect(mockSetCamera).not.toHaveBeenCalled();
  fireEvent(map, 'mapReady');
  expect(mockSetCamera).not.toHaveBeenCalled();
  fireEvent(map, 'layout', { nativeEvent: { layout: { width: 0, height: 0 } } });
  expect(mockSetCamera).not.toHaveBeenCalled();
  fireEvent(map, 'layout', { nativeEvent: { layout: { width: 358, height: 20 } } });
  expect(mockSetCamera).not.toHaveBeenCalled();
  fireEvent(map, 'layout', { nativeEvent: { layout: { width: 358, height: 220 } } });
  expect(mockSetCamera).toHaveBeenCalledTimes(1);
  fireEvent(map, 'mapLoaded');
  expect(onReady).toHaveBeenCalled();
  expect(map.props.showsUserLocation).toBeUndefined();
  screen.rerender(<CityMapCanvas region={{ latitude: 7, longitude: 82, latitudeDelta: 0.01, longitudeDelta: 0.01 }} items={[]}
    styles={createDestinationStyles()} onReady={onReady} interactive />);
  expect(mockSetCamera).toHaveBeenCalledTimes(1);
  await act(async () => {});
});
