import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';

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

let mockRecommendationState;

jest.mock('../src/hooks/useRecommendations', () => ({
  useRecommendations: () => mockRecommendationState,
}));
jest.mock('../src/services/PersonalizationService', () => ({
  clearPersonalizationDiscoveryCache: jest.fn(),
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
jest.mock('../src/hooks/useLiveUserLocation', () => ({
  useLiveUserLocation: () => ({
    location: null,
    status: 'idle',
    awaitingFirstFix: true,
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
  }),
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
  return ({ children, ...props }) => ReactModule.createElement(View, props, children);
});
jest.mock('../src/features/community/components/CommunityInlineMap', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return () => ReactModule.createElement(View, { testID: 'mock-community-map' });
});
jest.mock('../src/components/RecommendationsFilterModal', () => () => null);
jest.mock('../src/components/RecommendationCard', () => () => null);
jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ ensureCapability: jest.fn(async () => false) }),
}));
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
  beforeEach(() => {
    mockRecommendationState = {
      data: [], error: null, loading: false, refreshing: false,
      refresh: jest.fn(), removeRecommendation: jest.fn(), setDiscoveryRequest: jest.fn(),
    };
  });

  it('hides feed sorting and labels the map as all recommendations in the area', () => {
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByTestId('community-sort-button')).toBeTruthy();
    expect(screen.queryByTestId('map-all-recommendations-label')).toBeNull();

    fireEvent.press(screen.getByTestId('community-map-toggle'));

    expect(screen.queryByTestId('community-sort-button')).toBeNull();
    expect(screen.getByText('כל ההמלצות באזור')).toBeTruthy();
    expect(screen.getByTestId('mock-community-map')).toBeTruthy();
  });

  it('centers empty and error copy in the available feed body', () => {
    mockRecommendationState.error = new Error('load failed');
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    const list = screen.UNSAFE_getByType(FlatList);
    const contentStyle = StyleSheet.flatten(list.props.contentContainerStyle);
    const emptyStyle = StyleSheet.flatten(screen.getByTestId('community-empty-state').props.style);

    expect(contentStyle).toMatchObject({ flexGrow: 1 });
    expect(StyleSheet.flatten(list.props.style).backgroundColor).toBe('#28486D');
    expect(list.props.ListHeaderComponent).toBeTruthy();
    expect(list.props.stickyHeaderIndices).toBeUndefined();
    expect(screen.getByTestId('community-tab-header').props.overlapNext).toBeUndefined();
    expect(emptyStyle).toMatchObject({ marginTop: 0, justifyContent: 'center' });
  });

  it('replaces the feed with a centered state while refreshing', () => {
    mockRecommendationState.refreshing = true;
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);

    expect(screen.getByTestId('community-refresh-state')).toBeTruthy();
    expect(screen.queryByTestId('community-empty-state')).toBeNull();
  });
});
