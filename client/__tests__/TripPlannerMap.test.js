import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { View } from 'react-native';

jest.mock('react-native-maps', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(({ children, onMapReady, ...props }, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({ fitToCoordinates: jest.fn() }));
      return ReactModule.createElement(NativeView, { ...props, testID: 'trip-map', onLayout: onMapReady }, children);
    }),
    Marker: (props) => ReactModule.createElement(NativeView, { ...props, testID: `trip-marker-${props.title}` }),
    Polyline: (props) => ReactModule.createElement(NativeView, { ...props, testID: 'trip-route-line' }),
    PROVIDER_GOOGLE: 'google',
  };
});

const TripPlannerMap = require('../src/features/tripPlanner/components/TripPlannerMap').default;

test('the same selected recommendation represented in the list also has a real map marker', () => {
  const select = jest.fn();
  const screen = render(<View style={{ height: 200 }}><TripPlannerMap
    stops={[{ id: 'stop-1', title: 'תצפית הכרמל', coordinates: { lat: 32.8, lng: 35 } }]}
    onSelectStop={select}
  /></View>);
  expect(screen.getByTestId('trip-map').props.provider).toBe('google');
  const marker = screen.getByTestId('trip-marker-1. תצפית הכרמל');
  expect(marker.props.coordinate).toEqual({ latitude: 32.8, longitude: 35 });
  fireEvent(marker, 'press');
  expect(select).toHaveBeenCalledWith('stop-1');
});
