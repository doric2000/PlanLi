import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RouteDetailScreen from '../src/features/roadtrip/screens/RouteDetailScreen';

jest.mock('react-native-maps');
jest.mock('../src/hooks/useUserData', () => ({
  useUserData: () => ({ displayName: 'Dana', photoURL: null }),
}));
jest.mock('../src/hooks/useAdminClaim', () => ({ useAdminClaim: () => ({ isAdmin: false }) }));
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: null } }));
jest.mock('../src/services/RouteService', () => ({ recordRouteOpen: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/features/community/hooks/useLikes', () => ({
  useLikes: () => ({ isLiked: false, likeCount: 0, toggleLike: jest.fn() }),
}));
jest.mock('../src/features/community/hooks/useCommentsCount', () => ({ useCommentsCount: () => 0 }));
jest.mock('../src/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('../src/components/CommentsModal', () => ({ CommentsModal: () => null }));
jest.mock('../src/components/LikesModal', () => () => null);
jest.mock('../src/components/RecommendationHero', () => ({ RecommendationHero: () => null }));
jest.mock('../src/components/RecommendationActionBar', () => ({ RecommendationActionBar: () => null }));
jest.mock('../src/components/MediaGalleryModal', () => () => null);
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) => ReactModule.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
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
  }, {
    id: 'day-2', position: 1, description: 'יום שני',
    stops: [{
      id: 'stop-2', title: 'הנמל',
      destination: { countryId: 'IL', cityId: 'haifa' },
      place: { coordinates: { lat: 32.82, lng: 34.99 } },
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

    expect(screen.getByTestId('route-day-stops-0')).toBeTruthy();
    expect(screen.queryByTestId('route-day-stops-1')).toBeNull();
    fireEvent.press(screen.getByTestId('route-day-toggle-1'));
    expect(screen.queryByTestId('route-day-stops-0')).toBeNull();
    expect(screen.getByTestId('route-day-stops-1')).toBeTruthy();
  });
});
