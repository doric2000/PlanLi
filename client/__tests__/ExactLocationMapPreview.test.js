import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

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

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('mounts cached Apple Maps immediately on iOS and clears its skeleton when ready', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const screen = render(<ExactLocationMapPreview place={place} />);
    const map = screen.getByTestId('exact-location-map-preview');
    expect(map.props.provider).toBeUndefined();
    expect(map.props.cacheEnabled).toBe(true);
    expect(map.props.liteMode).toBe(false);
    expect(map.props.region).toEqual(expect.objectContaining({ latitude: 48.2106, longitude: 16.3652 }));
    expect(screen.getByTestId('exact-location-map-preview-skeleton')).toBeTruthy();
    await act(async () => map.props.onMapReady());
    expect(screen.queryByTestId('exact-location-map-preview-skeleton')).toBeNull();
  });

  it('mounts Google liteMode immediately on Android and waits for tiles to load', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const screen = render(<ExactLocationMapPreview place={place} />);
    const map = screen.getByTestId('exact-location-map-preview');
    expect(map.props.provider).toBe('google');
    expect(map.props.liteMode).toBe(true);
    expect(map.props.cacheEnabled).toBe(false);
    expect(map.props.onMapReady).toBeUndefined();
    expect(screen.getByTestId('exact-location-map-preview-skeleton')).toBeTruthy();

    act(() => map.props.onMapLoaded());
    expect(screen.queryByTestId('exact-location-map-preview-skeleton')).toBeNull();
  });

  it('shows a bounded failure, retries the native map, and cancels the timeout after loading', () => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const screen = render(<ExactLocationMapPreview place={place} />);

    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByTestId('exact-location-map-preview-error')).toBeTruthy();
    expect(screen.getByText('לא הצלחנו להציג את המפה. אפשר עדיין לאשר את המיקום.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('exact-location-map-preview-retry'));
    expect(screen.queryByTestId('exact-location-map-preview-error')).toBeNull();
    expect(screen.getByTestId('exact-location-map-preview-skeleton')).toBeTruthy();

    act(() => screen.getByTestId('exact-location-map-preview').props.onMapLoaded());
    expect(screen.queryByTestId('exact-location-map-preview-skeleton')).toBeNull();
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.queryByTestId('exact-location-map-preview-error')).toBeNull();
  });

  it('resets loading and recenters when the selected coordinates change', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const screen = render(<ExactLocationMapPreview place={place} />);
    act(() => screen.getByTestId('exact-location-map-preview').props.onMapLoaded());
    expect(screen.queryByTestId('exact-location-map-preview-skeleton')).toBeNull();

    screen.rerender(
      <ExactLocationMapPreview
        place={{ name: 'Kosko', coordinates: { lat: 42.6983, lng: 23.3199 } }}
      />
    );

    const map = screen.getByTestId('exact-location-map-preview');
    expect(map.props.region).toEqual(expect.objectContaining({ latitude: 42.6983, longitude: 23.3199 }));
    expect(screen.getByTestId('exact-location-map-preview-skeleton')).toBeTruthy();
  });
});
