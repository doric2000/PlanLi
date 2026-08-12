import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RouteDetailScreen from '../src/features/roadtrip/screens/RouteDetailScreen';

jest.mock('react-native-maps');
jest.mock('../src/hooks/useUserData', () => ({
  useUserData: () => ({ displayName: 'Dana', photoURL: null }),
}));
jest.mock('../src/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, ...props }) => ReactModule.createElement(View, props, children) };
});
jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

const routeData = {
  id: 'route-1',
  ownerId: 'owner-1',
  title: 'מסלול בצפון',
  description: 'תיאור מסלול',
  dayCount: 1,
  distanceKm: 42,
  categoryIds: [],
  subcategoryIds: [],
  facets: {},
  destinationPreviews: [{
    countryId: 'IL', cityId: 'haifa', name: 'חיפה',
    destinationImage: { urls: { thumb: 'https://img.example/haifa.jpg' } },
  }],
  days: [{
    id: 'day-1', position: 0, description: '',
    stops: [{
      id: 'stop-1', title: 'הגנים הבהאיים',
      destination: { countryId: 'IL', cityId: 'haifa' },
      place: { coordinates: { lat: 32.812, lng: 34.987 } },
    }],
  }],
};

describe('RouteDetailScreen', () => {
  it('uses one elegant destination strip and opens the map through navigation', () => {
    const navigation = { setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
    const screen = render(
      <RouteDetailScreen route={{ params: { routeData } }} navigation={navigation} />
    );

    expect(screen.getByText('חיפה')).toBeTruthy();
    expect(screen.getAllByText('חיפה')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('route-map-preview'));
    expect(navigation.navigate).toHaveBeenCalledWith('RouteMap', { routeData });
  });
});
