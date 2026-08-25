import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CommunityInlineMap from '../src/features/community/components/CommunityInlineMap';

const mockStartTracking = jest.fn(() => Promise.resolve(null));
const mockStopTracking = jest.fn();
let mockLocationState;

jest.mock('react-native-maps');

jest.mock('../src/config/mapConfig', () => ({
  DEFAULT_MAP_CENTER: [34.85, 31.04],
  DEFAULT_MAP_ZOOM: 7,
  USER_MAP_ZOOM: 15,
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(NativeText, null, `icon:${name}`);
  Icon.loadFont = jest.fn(() => Promise.resolve());
  return { Ionicons: Icon, MaterialIcons: Icon };
});

jest.mock('../src/hooks/useLiveUserLocation', () => ({
  useLiveUserLocation: () => ({
    ...mockLocationState,
    startTracking: mockStartTracking,
    stopTracking: jest.fn(),
  }),
}));

function MapUnderTest(props) {
  return (
    <CommunityInlineMap
      {...props}
      locationState={{
        ...mockLocationState,
        startTracking: mockStartTracking,
        stopTracking: mockStopTracking,
      }}
    />
  );
}

jest.mock('../src/features/community/components/RecommendationMapPreviewCard', () => (
  function MockPreview({ item, onClose, onOpenRecommendation }) {
    const ReactModule = require('react');
    const { Pressable, Text, View } = require('react-native');
    return ReactModule.createElement(
      View,
      { testID: 'mock-map-preview' },
      ReactModule.createElement(Text, null, item.title),
      ReactModule.createElement(Pressable, { testID: 'mock-map-preview-close', onPress: onClose }),
      ReactModule.createElement(Pressable, {
        testID: 'mock-map-preview-open',
        onPress: () => onOpenRecommendation(item.postId || item.id),
      })
    );
  }
));

const recommendations = [
  {
    id: 'rec-1',
    postId: 'post-1',
    title: 'Local restaurant',
    categoryId: 'food',
    place: { coordinates: { lat: 32.1, lng: 34.8 } },
  },
  {
    id: 'rec-2',
    postId: 'post-2',
    title: 'Nature reserve',
    categoryId: 'nature',
    place: { coordinates: { lat: 32.2, lng: 34.9 } },
  },
];

describe('CommunityInlineMap', () => {
  beforeEach(() => {
    mockStartTracking.mockReset();
    mockStartTracking.mockResolvedValue(null);
    mockStopTracking.mockClear();
    mockLocationState = {
      location: { lat: 41.7151, lng: 44.8271, accuracy: 10 },
      status: 'granted',
      awaitingFirstFix: false,
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('waits for native tiles before showing an empty recommendation result', async () => {
    const screen = render(<MapUnderTest recommendations={[]} />);

    expect(screen.getByTestId('community-map-loading')).toBeTruthy();
    expect(screen.queryByText('אין המלצות באזור המוצג')).toBeNull();

    act(() => screen.getByTestId('community-inline-map').props.onMapLoaded());
    await act(async () => {});
    expect(screen.queryByTestId('community-map-loading')).toBeNull();
    expect(screen.getByText('אין המלצות באזור המוצג')).toBeTruthy();
  });

  it('times out a blank basemap and remounts it for an explicit retry', async () => {
    jest.useFakeTimers();
    const screen = render(<MapUnderTest recommendations={[]} />);

    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByTestId('community-map-load-error')).toBeTruthy();
    expect(screen.queryByText('אין המלצות באזור המוצג')).toBeNull();

    fireEvent.press(screen.getByTestId('community-map-load-retry'));
    expect(screen.queryByTestId('community-map-load-error')).toBeNull();
    expect(screen.getByTestId('community-map-loading')).toBeTruthy();

    act(() => screen.getByTestId('community-inline-map').props.onMapLoaded());
    await act(async () => {});
    expect(screen.queryByTestId('community-map-loading')).toBeNull();
    expect(screen.getByText('אין המלצות באזור המוצג')).toBeTruthy();
  });

  it('opens directly on the first precise location at approximately zoom 15', async () => {
    const onSearchViewport = jest.fn();
    const screen = render(
      <MapUnderTest recommendations={[]} onSearchViewport={onSearchViewport} />
    );
    await act(async () => {});

    const region = screen.getByTestId('community-inline-map').props.initialRegion;
    expect(region.latitude).toBe(41.7151);
    expect(region.longitude).toBe(44.8271);
    expect(region.latitudeDelta).toBeCloseTo(360 / (2 ** 15));
    expect(onSearchViewport).toHaveBeenCalledWith(expect.objectContaining({
      zoom: expect.any(Number),
      north: expect.any(Number),
      south: expect.any(Number),
    }));
    expect(screen.getByTestId('community-inline-map').props.provider).toBe('google');
    expect(screen.queryByTestId('map-url-tile')).toBeNull();
  });

  it('prioritizes a focused recommendation over user-location startup and opens its preview', async () => {
    mockLocationState = { location: null, status: 'locating', awaitingFirstFix: true };
    const onSearchViewport = jest.fn();
    const focusRequest = {
      requestId: 'rec-2:1',
      recommendationId: 'rec-2',
      coordinates: { lat: 32.2, lng: 34.9 },
    };
    const screen = render(
      <MapUnderTest
        recommendations={recommendations}
        focusRequest={focusRequest}
        onSearchViewport={onSearchViewport}
      />
    );
    await act(async () => {});

    const region = screen.getByTestId('community-inline-map').props.initialRegion;
    expect(region.latitude).toBe(32.2);
    expect(region.longitude).toBe(34.9);
    expect(region.latitudeDelta).toBeCloseTo(360 / (2 ** 16));
    expect(onSearchViewport).toHaveBeenCalledWith(expect.objectContaining({
      north: expect.any(Number),
      south: expect.any(Number),
      zoom: expect.any(Number),
    }));
    await waitFor(() => expect(screen.getByText('Nature reserve')).toBeTruthy());

    fireEvent.press(screen.getByTestId('mock-map-preview-close'));
    expect(screen.queryByTestId('mock-map-preview')).toBeNull();
    screen.rerender(
      <MapUnderTest
        recommendations={recommendations}
        focusRequest={focusRequest}
        onSearchViewport={onSearchViewport}
      />
    );
    expect(screen.queryByTestId('mock-map-preview')).toBeNull();
  });

  it('waits for the first location before mounting the native map', async () => {
    mockLocationState = { location: null, status: 'locating', awaitingFirstFix: true };
    const screen = render(<MapUnderTest recommendations={[]} />);
    await act(async () => {});
    expect(screen.getByTestId('map-awaiting-location')).toBeTruthy();
    expect(screen.queryByTestId('community-inline-map')).toBeNull();
  });

  it('selects pins repeatedly, keeps the preview stable, and opens by postId', async () => {
    const onOpenRecommendation = jest.fn();
    const screen = render(
      <MapUnderTest
        recommendations={recommendations}
        overlayBottomInset={92}
        onOpenRecommendation={onOpenRecommendation}
      />
    );
    await act(async () => {});

    expect(StyleSheet.flatten(screen.getByTestId('community-map-controls').props.style)).toMatchObject({
      right: 14,
      bottom: 104,
    });

    for (let index = 0; index < 40; index += 1) {
      fireEvent.press(screen.getByTestId(`recommendation-map-marker-rec-${(index % 2) + 1}`));
    }
    expect(screen.getByText('Nature reserve')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('community-map-controls').props.style)).toMatchObject({
      right: 14,
      top: 68,
    });
    expect(StyleSheet.flatten(screen.getByTestId('community-map-controls').props.style).bottom).toBeUndefined();
    fireEvent.press(screen.getByTestId('mock-map-preview-open'));
    expect(onOpenRecommendation).toHaveBeenCalledWith('post-2');

    fireEvent.press(screen.getByTestId('community-inline-map'));
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });

  it('offers viewport search after the user pans the map', async () => {
    const onSearchViewport = jest.fn();
    const screen = render(
      <MapUnderTest recommendations={recommendations} onSearchViewport={onSearchViewport} />
    );
    await act(async () => {});
    onSearchViewport.mockClear();

    const map = screen.getByTestId('community-inline-map');
    fireEvent(map, 'panDrag');
    fireEvent(map, 'regionChangeComplete', {
      latitude: 41.7,
      longitude: 44.8,
      latitudeDelta: 0.2,
      longitudeDelta: 0.2,
    }, { isGesture: true });
    fireEvent.press(screen.getByTestId('map-search-this-area'));

    const viewport = onSearchViewport.mock.calls[0][0];
    expect(viewport.north).toBeCloseTo(41.8);
    expect(viewport.south).toBeCloseTo(41.6);
    expect(onSearchViewport).toHaveBeenCalledWith(
      expect.objectContaining({ north: expect.any(Number), south: expect.any(Number) }),
      { forceRefresh: true }
    );
  });

  it('clears selection when a viewport refresh removes the selected recommendation', async () => {
    const screen = render(<MapUnderTest recommendations={recommendations} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('recommendation-map-marker-rec-2'));
    expect(screen.getByTestId('mock-map-preview')).toBeTruthy();

    screen.rerender(<MapUnderTest recommendations={[recommendations[0]]} />);
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });

  it('falls back after denied permission and offers a non-blocking retry', async () => {
    mockLocationState = { location: null, status: 'denied', awaitingFirstFix: false };
    const screen = render(<MapUnderTest recommendations={[]} />);
    await act(async () => {});
    const region = screen.getByTestId('community-inline-map').props.initialRegion;
    expect(region.latitude).toBe(31.04);
    expect(region.longitude).toBe(34.85);

    fireEvent.press(screen.getByText('אפשר להפעיל מיקום כדי למצוא המלצות קרובות'));
    expect(mockStartTracking).toHaveBeenCalled();
  });

  it('centers when a pending location request resolves after pressing my location', async () => {
    const recoveredLocation = { lat: 41.7151, lng: 44.8271, accuracy: 8 };
    mockLocationState = { location: null, status: 'timeout', awaitingFirstFix: false };
    mockStartTracking.mockResolvedValue(recoveredLocation);
    const screen = render(<MapUnderTest recommendations={[]} />);
    await act(async () => {});

    fireEvent.press(screen.getByTestId('map-my-location'));

    await waitFor(() => {
      const region = screen.getByTestId('community-inline-map').props.initialRegion;
      expect(region.latitude).toBe(recoveredLocation.lat);
      expect(region.longitude).toBe(recoveredLocation.lng);
    });
  });

  it('centers automatically when the first precise fix arrives after a timeout', async () => {
    mockLocationState = { location: null, status: 'timeout', awaitingFirstFix: false };
    const screen = render(<MapUnderTest recommendations={[]} />);
    await act(async () => {});
    expect(screen.getByTestId('community-inline-map').props.initialRegion.latitude).toBe(31.04);

    mockLocationState = {
      location: { lat: 41.7151, lng: 44.8271, accuracy: 8 },
      status: 'granted',
      awaitingFirstFix: false,
    };
    screen.rerender(<MapUnderTest recommendations={[]} />);

    await waitFor(() => {
      const region = screen.getByTestId('community-inline-map').props.initialRegion;
      expect(region.latitude).toBe(41.7151);
      expect(region.longitude).toBe(44.8271);
    });
  });
});
