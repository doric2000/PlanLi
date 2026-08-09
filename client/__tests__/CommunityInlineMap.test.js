import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CommunityInlineMap from '../src/features/community/components/CommunityInlineMap';

const mockStartTracking = jest.fn(() => Promise.resolve(null));
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
    mockStartTracking.mockClear();
    mockLocationState = {
      location: { lat: 41.7151, lng: 44.8271, accuracy: 10 },
      status: 'granted',
      awaitingFirstFix: false,
    };
  });

  it('opens directly on the first precise location at approximately zoom 15', async () => {
    const onSearchViewport = jest.fn();
    const screen = render(
      <CommunityInlineMap recommendations={[]} onSearchViewport={onSearchViewport} />
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
  });

  it('waits for the first location before mounting the native map', async () => {
    mockLocationState = { location: null, status: 'locating', awaitingFirstFix: true };
    const screen = render(<CommunityInlineMap recommendations={[]} />);
    await act(async () => {});
    expect(screen.getByTestId('map-awaiting-location')).toBeTruthy();
    expect(screen.queryByTestId('community-inline-map')).toBeNull();
  });

  it('selects pins repeatedly, keeps the preview stable, and opens by postId', async () => {
    const onOpenRecommendation = jest.fn();
    const screen = render(
      <CommunityInlineMap
        recommendations={recommendations}
        overlayBottomInset={92}
        onOpenRecommendation={onOpenRecommendation}
      />
    );
    await act(async () => {});

    for (let index = 0; index < 40; index += 1) {
      fireEvent.press(screen.getByTestId(`recommendation-map-marker-rec-${(index % 2) + 1}`));
    }
    expect(screen.getByText('Nature reserve')).toBeTruthy();
    fireEvent.press(screen.getByTestId('mock-map-preview-open'));
    expect(onOpenRecommendation).toHaveBeenCalledWith('post-2');

    fireEvent.press(screen.getByTestId('community-inline-map'));
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });

  it('offers viewport search after the user pans the map', async () => {
    const onSearchViewport = jest.fn();
    const screen = render(
      <CommunityInlineMap recommendations={recommendations} onSearchViewport={onSearchViewport} />
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
  });

  it('clears selection when a viewport refresh removes the selected recommendation', async () => {
    const screen = render(<CommunityInlineMap recommendations={recommendations} />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('recommendation-map-marker-rec-2'));
    expect(screen.getByTestId('mock-map-preview')).toBeTruthy();

    screen.rerender(<CommunityInlineMap recommendations={[recommendations[0]]} />);
    await waitFor(() => expect(screen.queryByTestId('mock-map-preview')).toBeNull());
  });

  it('falls back after denied permission and offers a non-blocking retry', async () => {
    mockLocationState = { location: null, status: 'denied', awaitingFirstFix: false };
    const screen = render(<CommunityInlineMap recommendations={[]} />);
    await act(async () => {});
    const region = screen.getByTestId('community-inline-map').props.initialRegion;
    expect(region.latitude).toBe(31.04);
    expect(region.longitude).toBe(34.85);

    fireEvent.press(screen.getByText('אפשר להפעיל מיקום כדי למצוא המלצות קרובות'));
    expect(mockStartTracking).toHaveBeenCalled();
  });
});
