import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import RouteMapScreen from '../src/features/roadtrip/screens/RouteMapScreen';

const mockFlyTo = jest.fn();
const mockFitBounds = jest.fn();
const mockStartTracking = jest.fn(() => Promise.resolve(null));

jest.mock('../src/config/mapConfig', () => ({
  DEFAULT_MAP_CENTER: [34.85, 31.04],
  DEFAULT_MAP_ZOOM: 7,
  USER_MAP_ZOOM: 15,
  getMapTilerKey: () => 'test-key',
  getMapTilerStyleUrl: () => 'https://example.com/style.json',
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactModule = require('react');
  const { Pressable, View } = require('react-native');
  const Map = ReactModule.forwardRef(({ children, onDidFinishLoadingMap, testID }, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({}));
    ReactModule.useEffect(() => onDidFinishLoadingMap?.(), [onDidFinishLoadingMap]);
    return ReactModule.createElement(Pressable, { testID }, children);
  });
  const Camera = ReactModule.forwardRef((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({ flyTo: mockFlyTo, fitBounds: mockFitBounds }));
    return ReactModule.createElement(View, props);
  });
  return {
    Map,
    Camera,
    GeoJSONSource: ({ children }) => ReactModule.createElement(View, null, children),
    Layer: (props) => ReactModule.createElement(View, props),
    TransformRequestManager: { addHeader: jest.fn() },
  };
});

jest.mock('../src/hooks/useLiveUserLocation', () => ({
  useLiveUserLocation: () => ({
    location: { lat: 32.08, lng: 34.78, accuracy: 10 },
    status: 'granted',
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
  Title: 'מסלול צפוני',
  days: [{
    stops: [
      { id: 'a', title: 'ראשונה', place: { coordinates: { lat: 32.08, lng: 34.78 } } },
      { id: 'b', title: 'שנייה', place: { coordinates: { lat: 32.18, lng: 34.88 } } },
    ],
  }],
};

describe('RouteMapScreen', () => {
  beforeEach(() => {
    mockFlyTo.mockClear();
    mockFitBounds.mockClear();
  });

  it('fits all numbered stops and provides a user recenter action', async () => {
    const screen = render(
      <RouteMapScreen
        route={{ params: { routeData } }}
        navigation={{ goBack: jest.fn() }}
      />
    );
    await act(async () => {});
    expect(screen.getByText('מסלול צפוני')).toBeTruthy();
    expect(screen.getByText('2 תחנות עם מיקום')).toBeTruthy();
    expect(screen.getByTestId('route-map')).toBeTruthy();
    expect(mockFitBounds).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('route-map-my-location'));
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: [34.78, 32.08],
      zoom: 15,
    }));
  });
});
