import React from 'react';
import { render } from '@testing-library/react-native';

import CityCard from '../src/components/CityCard';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`),
  };
});

jest.mock('../src/components/CachedImage', () => function MockCachedImage() {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ReactModule.createElement(View, { testID: 'city-image' });
});

jest.mock('../src/components/PreferenceContextLine', () => function MockPreferenceContextLine() {
  return null;
});

describe('CityCard', () => {
  it('shows travelers without rendering a legacy score or star', () => {
    const screen = render(
      <CityCard
        city={{
          id: 'city-1',
          name: 'Tel Aviv',
          countryName: 'Israel',
          imageUrl: 'https://example.com/city.webp',
          travelers: 12,
          rating: 4.8,
        }}
        variant="home"
      />
    );

    expect(screen.getByText(/12/)).toBeTruthy();
    expect(screen.queryByText('4.8')).toBeNull();
    expect(screen.queryByText('icon:star')).toBeNull();
  });
});
