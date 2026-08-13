import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FavoritesScreen from '../src/features/favorites/screen/FavoritesScreen';

jest.mock('../src/hooks/useFavoriteRecommendationsFull', () => ({
  useFavoriteRecommendationsFull: () => ({ favorites: [], loading: false, reload: jest.fn() }),
}));

jest.mock('../src/hooks/useFavoriteRoadTripsFull', () => ({
  useFavoriteRoadTripsFull: () => ({ favorites: [], loading: false, reload: jest.fn() }),
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

    fireEvent.press(within(header).getByText('המלצות'));
    expect(screen.getByTestId('favorite-recommendations-list')).toBeTruthy();
  });
});
