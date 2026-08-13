import React from 'react';
import { Animated } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FavoritesScreen from '../src/features/favorites/screen/FavoritesScreen';

const mockFavoriteRecommendationsFull = jest.fn(() => ({
  favorites: [], loading: false, reload: jest.fn(),
}));
const mockFavoriteRoadTripsFull = jest.fn(() => ({
  favorites: [], loading: false, reload: jest.fn(),
}));

jest.mock('../src/hooks/useFavoriteRecommendationsFull', () => ({
  useFavoriteRecommendationsFull: (options) => mockFavoriteRecommendationsFull(options),
}));

jest.mock('../src/hooks/useFavoriteRoadTripsFull', () => ({
  useFavoriteRoadTripsFull: (options) => mockFavoriteRoadTripsFull(options),
}));

jest.mock('../src/hooks/useTabPressScrollOrRefresh', () => ({
  useTabPressScrollOrRefresh: () => ({ onScroll: jest.fn() }),
}));

jest.mock('../src/features/favorites/components/FavoriteCitiesList', () => {
  const { View: MockView } = require('react-native');
  return () => <MockView testID="favorite-destinations-list" />;
});

jest.mock('../src/features/favorites/components/FavoriteRecommendationsList', () => {
  const { View: MockView } = require('react-native');
  return () => <MockView testID="favorite-recommendations-list" />;
});

jest.mock('../src/features/favorites/components/FavoriteRoadTripsList', () => {
  const { View: MockView } = require('react-native');
  return () => <MockView testID="favorite-routes-list" />;
});

jest.mock('@expo/vector-icons', () => {
  const { Text: MockText } = require('react-native');
  return { MaterialIcons: ({ name }) => <MockText>{name}</MockText> };
});

describe('Favorites blue header', () => {
  beforeEach(() => {
    mockFavoriteRecommendationsFull.mockClear();
    mockFavoriteRoadTripsFull.mockClear();
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
      start: (callback) => {
        value.setValue(config.toValue);
        callback?.({ finished: true });
      },
      stop: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the category tabs inside the shared hero and switches content', () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <FavoritesScreen />
      </SafeAreaProvider>
    );

    const header = screen.getByTestId('favorites-tab-header');
    expect(within(header).getByTestId('favorites-header-tabs')).toBeTruthy();
    expect(screen.getByTestId('favorite-destinations-list')).toBeTruthy();
    expect(mockFavoriteRecommendationsFull).toHaveBeenLastCalledWith({ enabled: false });
    expect(mockFavoriteRoadTripsFull).toHaveBeenLastCalledWith({ enabled: false });

    fireEvent.press(within(header).getByText('המלצות'));
    expect(screen.getByTestId('favorite-recommendations-list')).toBeTruthy();
    expect(screen.getByTestId('favorites-swipe-surface')).toBeTruthy();
    expect(mockFavoriteRecommendationsFull).toHaveBeenLastCalledWith({ enabled: true });
    expect(mockFavoriteRoadTripsFull).toHaveBeenLastCalledWith({ enabled: false });
  });

  it('keeps accepting horizontal swipes after a completed transition', () => {
    const animationCallbacks = [];
    Animated.timing.mockImplementation((value, config) => ({
      start: (callback) => {
        value.setValue(config.toValue);
        animationCallbacks.push(callback);
      },
      stop: jest.fn(),
    }));
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <FavoritesScreen />
      </SafeAreaProvider>
    );

    fireEvent.press(within(screen.getByTestId('favorites-tab-header')).getByText('המלצות'));
    act(() => animationCallbacks.shift()?.({ finished: true }));
    act(() => animationCallbacks.shift()?.({ finished: true }));

    const swipeSurface = screen.getByTestId('favorites-swipe-surface');
    swipeSurface.props.onStartShouldSetResponderCapture({
      nativeEvent: { touches: [{}] },
      touchHistory: {
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: 0,
        touchBank: [],
      },
    });
    const canSwipeAgain = swipeSurface.props.onMoveShouldSetResponderCapture({
      nativeEvent: { touches: [{}] },
      touchHistory: {
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: 16,
        touchBank: [{
          touchActive: true,
          currentTimeStamp: 16,
          previousPageX: 100,
          previousPageY: 100,
          currentPageX: 160,
          currentPageY: 100,
        }],
      },
    });

    expect(canSwipeAgain).toBe(true);
  });
});
