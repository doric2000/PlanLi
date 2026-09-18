import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CommunityInlineMap from '../src/features/community/components/CommunityInlineMap';
import { colors, community } from '../src/styles';
import { MaterialIcons } from '@expo/vector-icons';

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

  it('hides provider place labels without hiding road or park geometry', async () => {
    const screen = render(<MapUnderTest recommendations={recommendations} />);
    await act(async () => {});
    const map = screen.getByTestId('community-inline-map');
    expect(map.props.customMapStyle).toEqual([
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ]);
    expect(map.props.poiClickEnabled).toBe(false);
  });

  it('keeps branded accessible markers visible while the icon font is pending', async () => {
    MaterialIcons.loadFont.mockImplementationOnce(() => new Promise(() => {}));
    const screen = render(<MapUnderTest recommendations={recommendations} />);
    await act(async () => {});
    expect(screen.getAllByText('PlanLi')).toHaveLength(2);
    const marker = screen.getByTestId('recommendation-map-marker-rec-1');
    expect(marker.props.accessibilityLabel).toMatch(/^המלצת PlanLi, Local restaurant,/);
    expect(marker.props.accessibilityRole).toBe('button');
    expect(marker.props.anchor).toEqual({ x: 0.5, y: 1 });
    expect(StyleSheet.flatten(community.mapMarkerTouchTarget)).toMatchObject({ width: 84, height: 44 });
    expect(StyleSheet.flatten(community.mapMarkerTail)).toMatchObject({ borderTopWidth: 8 });
    expect(StyleSheet.flatten(community.mapMarkerBrand).writingDirection).toBe('ltr');
  });

  it('highlights the selected branded badge without changing its size and clears on background press', async () => {
    const screen = render(<MapUnderTest recommendations={recommendations} />);
    await act(async () => {});
    const badge = (id) => StyleSheet.flatten(screen.getByTestId(`recommendation-map-badge-${id}`).props.style);
    expect(badge('rec-1')).toMatchObject({ width: 84, height: 36, backgroundColor: colors.primary, borderColor: colors.white });
    expect(badge('rec-2').backgroundColor).toBe(colors.primary);
    fireEvent.press(screen.getByTestId('recommendation-map-marker-rec-1'));
    expect(badge('rec-1')).toMatchObject({ width: 84, height: 36, borderColor: colors.brandOrange });
    expect(screen.getByTestId('recommendation-map-marker-rec-1').props.zIndex).toBe(1000);
    expect(screen.getByTestId('mock-map-preview')).toBeTruthy();
    fireEvent.press(screen.getByTestId('community-inline-map'));
    expect(badge('rec-1').borderColor).toBe(colors.white);
    expect(screen.queryByTestId('mock-map-preview')).toBeNull();
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

  it('mounts and searches immediately while location is pending, with a non-blocking indicator', async () => {
    mockLocationState = { location: null, status: 'locating', awaitingFirstFix: true };
    const onSearchViewport = jest.fn();
    const screen = render(<MapUnderTest recommendations={[]} onSearchViewport={onSearchViewport} />);
    await act(async () => {});
    expect(screen.queryByTestId('map-awaiting-location')).toBeNull();
    expect(screen.getByTestId('community-inline-map').props.initialRegion.latitude).toBe(31.04);
    expect(screen.getByTestId('map-locating').props.pointerEvents).toBe('none');
    expect(onSearchViewport).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByTestId('community-inline-map'), 'regionChangeComplete', {
      latitude: 41.7, longitude: 44.8, latitudeDelta: 0.2, longitudeDelta: 0.2,
    }, { isGesture: true });
    fireEvent.press(screen.getByTestId('map-search-this-area'));
    expect(onSearchViewport).toHaveBeenCalledTimes(2);
  });

  it.each(['panDrag', 'regionChange', 'regionChangeComplete'])(
    'does not recenter on a late location after a %s gesture', async (gesture) => {
      mockLocationState = { location: null, status: 'locating', awaitingFirstFix: true };
      const screen = render(<MapUnderTest recommendations={[]} />);
      await act(async () => {});
      const original = screen.getByTestId('community-inline-map').props.initialRegion;
      fireEvent(screen.getByTestId('community-inline-map'), gesture, original, { isGesture: true });
      mockLocationState = {
        location: { lat: 41.7, lng: 44.8, accuracy: 10 }, status: 'granted', awaitingFirstFix: false,
      };
      screen.rerender(<MapUnderTest recommendations={[]} />);
      expect(screen.getByTestId('community-inline-map').props.initialRegion).toBe(original);
      expect(screen.queryByTestId('map-locating')).toBeNull();
    }
  );

  it('centers only once automatically and preserves a focused recommendation on later location updates', async () => {
    mockLocationState = { location: null, status: 'locating', awaitingFirstFix: true };
    const screen = render(<MapUnderTest recommendations={[]} />);
    await act(async () => {});
    mockLocationState = {
      location: { lat: 41.7, lng: 44.8, accuracy: 100 }, status: 'granted', awaitingFirstFix: false,
    };
    screen.rerender(<MapUnderTest recommendations={[]} />);
    await waitFor(() => expect(screen.getByTestId('community-inline-map').props.initialRegion.latitude).toBe(41.7));
    mockLocationState = { ...mockLocationState, location: { lat: 42, lng: 45, accuracy: 5 } };
    screen.rerender(<MapUnderTest recommendations={[]} />);
    expect(screen.getByTestId('community-inline-map').props.initialRegion.latitude).toBe(41.7);
    const focusRequest = { requestId: 'focus-1', recommendationId: 'rec-1', coordinates: { lat: 32.1, lng: 34.8 } };
    screen.rerender(<MapUnderTest recommendations={recommendations} focusRequest={focusRequest} />);
    await waitFor(() => expect(screen.getByTestId('community-inline-map').props.initialRegion.latitude).toBe(32.1));
    mockLocationState = { ...mockLocationState, location: { lat: 43, lng: 46, accuracy: 5 } };
    screen.rerender(<MapUnderTest recommendations={recommendations} focusRequest={focusRequest} />);
    expect(screen.getByTestId('community-inline-map').props.initialRegion.latitude).toBe(32.1);
    expect(screen.getByTestId('mock-map-preview')).toBeTruthy();
  });

  it('keeps pins and retries the current viewport after a recommendation error', async () => {
    const onSearchViewport = jest.fn();
    const screen = render(<MapUnderTest recommendations={recommendations} error={new Error('offline')} onSearchViewport={onSearchViewport} />);
    await act(async () => {});
    act(() => screen.getByTestId('community-inline-map').props.onMapLoaded());
    expect(screen.getByTestId('recommendation-map-marker-rec-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('map-recommendations-retry'));
    expect(onSearchViewport).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 15 }), { forceRefresh: true });
    expect(screen.queryByText('אין המלצות באזור המוצג')).toBeNull();
  });

  it('does not move back when a pending my-location request completes after another gesture', async () => {
    let resolveLocation;
    mockLocationState = { location: null, status: 'locating', awaitingFirstFix: true };
    mockStartTracking.mockImplementation(() => new Promise((resolve) => { resolveLocation = resolve; }));
    const screen = render(<MapUnderTest recommendations={[]} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('map-my-location'));
    fireEvent(screen.getByTestId('community-inline-map'), 'panDrag');
    await act(async () => resolveLocation({ lat: 41.7, lng: 44.8, accuracy: 5 }));
    expect(screen.getByTestId('community-inline-map').props.initialRegion.latitude).toBe(31.04);
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
