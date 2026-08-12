import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CommunityScreen from '../src/features/community/screens/CommunityScreen';

const mockFilters = {
  query: '',
  destinations: [],
  categoryIds: [],
  subcategoryIds: [],
  audienceIds: [],
  vibeIds: [],
  needIds: [],
  budgetLevels: [],
  environments: [],
};

jest.mock('../src/hooks/useRecommendations', () => ({
  useRecommendations: () => ({
    data: [], error: null, loading: false, refreshing: false,
    refresh: jest.fn(), removeRecommendation: jest.fn(), setDiscoveryRequest: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useMapRecommendations', () => ({
  useMapRecommendations: () => ({
    items: [], loading: false, error: null, truncated: false, zoomInRequired: false,
    searchViewport: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useRecommendationFilter', () => ({
  useRecommendationFilter: () => ({
    filteredData: [], filters: mockFilters, isFiltered: false,
    updateFilters: jest.fn(), replaceFilters: jest.fn(), clearFilters: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useUserLocation', () => ({
  useUserLocation: () => ({ location: null, requestLocation: jest.fn() }),
}));
jest.mock('../src/hooks/useTabPressScrollOrRefresh', () => ({
  useTabPressScrollOrRefresh: () => ({ onScroll: jest.fn() }),
}));
jest.mock('../src/hooks/useSmartProfile', () => ({
  useSmartProfile: () => ({ smartProfile: {}, completed: false, loading: false }),
}));
jest.mock('../src/features/community/publishing/RecommendationPublishContext', () => ({
  useRecommendationPublish: () => ({ completedVersion: 0 }),
}));

jest.mock('../src/components/PageHeader', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ({ children }) => ReactModule.createElement(View, null, children);
});
jest.mock('../src/features/community/components/CommunityInlineMap', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return () => ReactModule.createElement(View, { testID: 'mock-community-map' });
});
jest.mock('../src/components/RecommendationsFilterModal', () => () => null);
jest.mock('../src/components/RecommendationCard', () => () => null);
jest.mock('../src/components/FabButton', () => () => null);
jest.mock('../src/components/ActiveFiltersList', () => () => null);
jest.mock('../src/features/community/components/SortMenuModal', () => ({ SortMenuModal: () => null }));
jest.mock('../src/components/CommentsModal', () => ({ CommentsModal: () => null }));
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: null } }));

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
  return { Ionicons: Icon };
});

describe('CommunityScreen map mode', () => {
  it('hides feed sorting and labels the map as all recommendations in the area', () => {
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByTestId('community-sort-button')).toBeTruthy();
    expect(screen.queryByTestId('map-all-recommendations-label')).toBeNull();

    fireEvent.press(screen.getByTestId('community-map-toggle'));

    expect(screen.queryByTestId('community-sort-button')).toBeNull();
    expect(screen.getByText('כל ההמלצות באזור')).toBeTruthy();
    expect(screen.getByTestId('mock-community-map')).toBeTruthy();
  });
});
