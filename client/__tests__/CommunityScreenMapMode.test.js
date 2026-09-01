import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';

import CommunityScreen from '../src/features/community/screens/CommunityScreen';
import { communityScreenStyles } from '../src/styles';

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
let mockFilteredData;
let mockMapItems;
let mockFocusedRecommendation;
let mockCommunityMapProps;
let mockCommunitySceneReady;
let mockNoyaContextValue;
let mockSmartProfile;
let mockSelectedRegionId;

jest.mock('../src/features/noya/NoyaTourContext', () => ({
  useNoyaMainTabRegistration: jest.fn(),
  useNoyaMainTabSceneReady: (_tabName, ready) => { mockCommunitySceneReady = ready; },
  useNoyaTour: () => mockNoyaContextValue,
  useNoyaTourTargetRegistration: () => ({ ref: { current: null }, onLayout: jest.fn() }),
}));

jest.mock('../src/hooks/useRecommendations', () => ({
  useRecommendations: () => mockRecommendationState,
}));
jest.mock('../src/services/PersonalizationService', () => ({
  clearPersonalizationDiscoveryCache: jest.fn(),
}));
jest.mock('../src/hooks/useMapRecommendations', () => ({
  useMapRecommendations: () => ({
    items: mockMapItems, loading: false, error: null, truncated: false, zoomInRequired: false,
    searchViewport: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useRecommendationById', () => ({
  useRecommendationById: () => ({
    data: mockFocusedRecommendation,
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useRecommendationFilter', () => ({
  useRecommendationFilter: () => ({
    filteredData: mockFilteredData, filters: mockFilters, isFiltered: false,
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
  useSmartProfile: () => mockSmartProfile,
}));
jest.mock('../src/features/community/publishing/RecommendationPublishContext', () => ({
  useRecommendationPublish: () => ({ completedVersion: 0 }),
}));
jest.mock('../src/features/region/context/RegionSelectionState', () => ({
  useOptionalRegionSelection: () => ({ selectedRegionId: mockSelectedRegionId }),
}));

jest.mock('../src/components/PageHeader', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  return ({ children, title, renderStart, renderEnd, renderTitleAccessory, ...props }) => ReactModule.createElement(
    View,
    props,
    renderStart?.(),
    title ? ReactModule.createElement(Text, null, title) : null,
    renderTitleAccessory?.(),
    renderEnd?.(),
    children
  );
});
jest.mock('../src/features/community/components/CommunityInlineMap', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return (props) => {
    mockCommunityMapProps = props;
    return ReactModule.createElement(View, { testID: 'mock-community-map' });
  };
});
jest.mock('../src/components/RecommendationsFilterModal', () => () => null);
jest.mock('../src/components/RecommendationCard', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ({ item, topContentInset }) => ReactModule.createElement(View, {
    testID: `recommendation-${item.id}`,
    topContentInset,
  });
});
jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ ensureCapability: jest.fn(async () => false) }),
}));
jest.mock('../src/components/FabButton', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return (props) => ReactModule.createElement(View, props);
});
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
    mockFilteredData = [];
    mockMapItems = [];
    mockFocusedRecommendation = null;
    mockCommunityMapProps = null;
    mockCommunitySceneReady = null;
    mockNoyaContextValue = { activeDefinition: null, pendingMainDefinition: null };
    mockSmartProfile = { smartProfile: {}, completed: false, loading: false };
    mockSelectedRegionId = null;
    delete process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
    mockRecommendationState = {
      data: [], error: null, loading: false, refreshing: false,
      confirming: false, requestSettled: true,
      refresh: jest.fn(), removeRecommendation: jest.fn(), setDiscoveryRequest: jest.fn(),
    };
  });

  it('uses a compact title icon for region changes without inserting the Home chip', () => {
    process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED = 'true';
    mockSelectedRegionId = 'israel';
    const navigation = { navigate: jest.fn() };
    const screen = render(<CommunityScreen navigation={navigation} />);

    expect(screen.queryByTestId('home-region-preview-chip')).toBeNull();
    const action = screen.getByTestId('community-region-change');
    expect(action.props.accessibilityLabel).toContain('ישראל');
    fireEvent.press(action);
    expect(navigation.navigate).toHaveBeenCalledWith('RegionSelector', { source: 'community-change' });
  });

  it('hides feed sorting and labels the map as all recommendations in the area', () => {
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByTestId('community-sort-button')).toBeTruthy();
    expect(screen.queryByTestId('map-all-recommendations-label')).toBeNull();

    fireEvent.press(screen.getByTestId('community-map-toggle'));

    expect(screen.queryByTestId('community-sort-button')).toBeNull();
    expect(screen.getByText('כל ההמלצות באזור')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('map-all-recommendations-label').props.style)).toMatchObject({
      width: 136,
      height: 44,
    });
    expect(screen.getByTestId('mock-community-map')).toBeTruthy();
  });

  it('restores list-only tour targets before a pending Community step appears', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<CommunityScreen navigation={navigation} />);
    fireEvent.press(screen.getByTestId('community-map-toggle'));
    expect(screen.queryByTestId('community-sort-button')).toBeNull();
    expect(screen.queryByTestId('community-add-button')).toBeNull();

    mockNoyaContextValue = {
      activeDefinition: null,
      pendingMainDefinition: { id: 'community-search', tabName: 'Community' },
    };
    screen.rerender(<CommunityScreen navigation={navigation} />);

    await waitFor(() => expect(screen.getByTestId('community-sort-button')).toBeTruthy());
    expect(screen.getByTestId('community-add-button')).toBeTruthy();
    expect(screen.queryByTestId('mock-community-map')).toBeNull();
  });

  it('waits for the personalized recommendation request before marking the scene ready', () => {
    mockSmartProfile = { smartProfile: {}, completed: true, loading: false };
    mockRecommendationState.requestSettled = false;
    const navigation = { navigate: jest.fn() };
    const screen = render(<CommunityScreen navigation={navigation} />);
    expect(mockCommunitySceneReady).toBe(false);

    mockRecommendationState.requestSettled = true;
    screen.rerender(<CommunityScreen navigation={navigation} />);

    expect(mockCommunitySceneReady).toBe(true);
  });

  it('centers empty and error copy in the available feed body', () => {
    mockRecommendationState.error = new Error('load failed');
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    const list = screen.UNSAFE_getByType(FlatList);
    const contentStyle = StyleSheet.flatten(list.props.contentContainerStyle);
    const emptyStyle = StyleSheet.flatten(screen.getByTestId('community-empty-state').props.style);

    expect(contentStyle).toMatchObject({ flexGrow: 1 });
    expect(StyleSheet.flatten(list.props.style).backgroundColor).toBe('#F4F5F9');
    expect(list.props.ListHeaderComponent).toBeTruthy();
    expect(list.props.stickyHeaderIndices).toBeUndefined();
    const header = screen.getByTestId('community-tab-header');
    expect(header.props.overlapNext).toBeUndefined();
    expect(header.props.rootRef).toBeUndefined();
    expect(header.props.onLayout).toBeUndefined();
    expect(screen.getByTestId('community-search-tour-target').props.onLayout).toEqual(expect.any(Function));
    expect(screen.getByTestId('community-filter-button').props.onLayout).toEqual(expect.any(Function));
    expect(screen.getByTestId('community-sort-button').props.onLayout).toEqual(expect.any(Function));
    expect(screen.getByTestId('community-map-toggle').props.onLayout).toEqual(expect.any(Function));
    expect(screen.getByTestId('community-add-button').props.onLayout).toEqual(expect.any(Function));
    expect(within(list).queryByTestId('community-tab-header')).toBeNull();
    expect(StyleSheet.flatten(list.props.ListHeaderComponent.props.style)).toMatchObject({
      paddingTop: 28,
      backgroundColor: '#F4F5F9',
    });
    expect(emptyStyle).toMatchObject({ marginTop: 0, justifyContent: 'center' });
  });

  it('uses the shared hero action geometry', () => {
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    expect(StyleSheet.flatten(screen.getByTestId('community-sort-button').props.style)).toMatchObject({
      width: 80,
      height: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('community-map-toggle').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('community-filter-button').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('community-search-row').props.style)).toMatchObject({
      width: '100%',
      marginTop: 12,
      gap: 8,
    });
    expect(StyleSheet.flatten(screen.getByTestId('community-search-field').props.style)).toMatchObject({
      width: '100%',
      height: 48,
      borderRadius: 16,
      paddingHorizontal: 14,
      flexDirection: 'row-reverse',
      gap: 9,
    });
    expect(StyleSheet.flatten(screen.getByTestId('community-search-input').props.style)).toMatchObject({
      height: '100%',
      fontSize: 15,
      paddingLeft: 0,
      paddingRight: 0,
      textAlign: 'right',
    });
  });

  it('replaces the feed with a centered state while refreshing', () => {
    mockRecommendationState.refreshing = true;
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);

    expect(screen.getByTestId('community-refresh-state')).toBeTruthy();
    expect(screen.queryByTestId('community-empty-state')).toBeNull();
  });

  it('keeps feed cards below the curved header after refresh remounts the first card', () => {
    mockFilteredData = [{ id: 'cached-recommendation' }];
    const screen = render(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByTestId('recommendation-cached-recommendation').props.topContentInset).toBeUndefined();
    expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.ListHeaderComponent.props.style).paddingTop).toBe(28);

    mockRecommendationState.refreshing = true;
    screen.rerender(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.queryByTestId('recommendation-cached-recommendation')).toBeNull();

    mockFilteredData = [{ id: 'refreshed-recommendation' }];
    mockRecommendationState.refreshing = false;
    screen.rerender(<CommunityScreen navigation={{ navigate: jest.fn() }} />);
    expect(screen.getByTestId('recommendation-refreshed-recommendation').props.topContentInset).toBeUndefined();
    expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.ListHeaderComponent.props.style).paddingTop).toBe(28);
  });

  it('consumes a focused-map command and keeps the canonical target ahead of filtered results', async () => {
    mockMapItems = [
      { id: 'rec-nearby', title: 'Nearby' },
      { id: 'rec-focus', title: 'Stale duplicate' },
    ];
    mockFocusedRecommendation = {
      id: 'rec-focus',
      title: 'Focused recommendation',
      place: { name: 'Exact hotel' },
    };
    const mapFocus = {
      requestId: 'rec-focus:1',
      recommendationId: 'rec-focus',
      coordinates: { lat: 40.4012, lng: 19.4811 },
    };
    const navigation = { navigate: jest.fn(), setParams: jest.fn() };
    const screen = render(
      <CommunityScreen navigation={navigation} route={{ params: { mapFocus } }} />
    );

    expect(await screen.findByTestId('mock-community-map')).toBeTruthy();
    expect(mockCommunityMapProps.focusRequest).toEqual(mapFocus);
    expect(mockCommunityMapProps.recommendations.map((item) => item.id)).toEqual([
      'rec-focus',
      'rec-nearby',
    ]);
    expect(mockCommunityMapProps.recommendations[0].place.coordinates).toEqual(mapFocus.coordinates);
    expect(navigation.setParams).toHaveBeenCalledWith({ mapFocus: undefined });

    screen.rerender(
      <CommunityScreen navigation={navigation} route={{ params: { mapFocus } }} />
    );
    expect(navigation.setParams).toHaveBeenCalledTimes(1);
  });
});
