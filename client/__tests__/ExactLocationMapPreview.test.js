import React from 'react';
import { InteractionManager, Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';

import ExactLocationMapPreview from '../src/components/ExactLocationMapPreview';

jest.mock('react-native-maps', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const Map = ({ children, ...props }) => ReactModule.createElement(View, props, children);
  return {
    __esModule: true,
    default: Map,
    Marker: (props) => ReactModule.createElement(View, { ...props, testID: 'map-marker' }),
    PROVIDER_GOOGLE: 'google',
  };
});

const place = {
  name: 'Café Central',
  coordinates: { lat: 48.2106, lng: 16.3652 },
};

describe('ExactLocationMapPreview platform modes', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      callback();
      return { cancel: jest.fn() };
    });
  });

  afterEach(() => {
    InteractionManager.runAfterInteractions.mockRestore();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('uses cached Apple Maps on iOS without a coordinate-keyed remount', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const screen = render(<ExactLocationMapPreview place={place} />);
    const map = screen.getByTestId('exact-location-map-preview');
    expect(map.props.provider).toBeUndefined();
    expect(map.props.cacheEnabled).toBe(true);
    expect(map.props.liteMode).toBe(false);
    expect(map.props.region).toEqual(expect.objectContaining({ latitude: 48.2106, longitude: 16.3652 }));
    expect(map.props).not.toHaveProperty('key');
    await act(async () => map.props.onMapReady());
    expect(screen.queryByTestId('exact-location-map-preview-skeleton')).toBeNull();
  });

  it('uses Google liteMode on Android', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const screen = render(<ExactLocationMapPreview place={place} />);
    const map = screen.getByTestId('exact-location-map-preview');
    expect(map.props.provider).toBe('google');
    expect(map.props.liteMode).toBe(true);
    expect(map.props.cacheEnabled).toBe(false);
  });
});
