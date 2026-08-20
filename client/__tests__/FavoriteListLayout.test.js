import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import FavoriteCitiesList from '../src/features/favorites/components/FavoriteCitiesList';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/components/CityCard', () => () => null);

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text: MockText } = require('react-native');
  return { MaterialIcons: ({ name }) => ReactModule.createElement(MockText, null, name) };
});

describe('Favorites list layout', () => {
  it('keeps the hero outside horizontal content and exposes the blue pull surface', () => {
    const screen = render(
      <FavoriteCitiesList
        favorites={[]}
        loading={false}
        refreshing={false}
        confirming={false}
        onRefresh={jest.fn()}
      />
    );
    const list = screen.UNSAFE_getByType(FlatList);

    expect(list.props.ListHeaderComponent).toBeUndefined();
    expect(StyleSheet.flatten(list.props.style).backgroundColor).toBe('#28486D');
    expect(StyleSheet.flatten(list.props.contentContainerStyle).backgroundColor).toBe('#F4F5F9');
  });
});
