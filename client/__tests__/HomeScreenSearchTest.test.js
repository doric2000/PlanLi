/**
 * Purpose: Verify HomeScreen search filtering and navigation behavior.
 *
 * What this test does:
 * - Renders HomeScreen with mocked data/services.
 * - Types a query and checks the list filters to matching cities.
 * - Presses a result card and verifies navigation to LandingPage.
 * - Types a non-matching query and checks the empty-state message.
 */
import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import { act, render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import HomeScreen from '../src/features/home/screens/HomeScreen';

const mockSearchDestinations = jest.fn();
const mockRequestDestinations = jest.fn();
const mockLoadRecentDestinations = jest.fn();
const mockRememberRecentDestinations = jest.fn();
const mockResolveDestinationForPlacePreview = jest.fn();
const mockEnsureCapability = jest.fn();
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
jest.mock('../src/services/DestinationService', () => ({
  searchDestinations: (...args) => mockSearchDestinations(...args),
  requestDestinations: (...args) => mockRequestDestinations(...args),
  destinationCatalogItemToCity: (item, placeholderColor) => {
    const data = item.data?.() || item;
    const countryId = item.countryId || item.ref?.parent?.parent?.id;
    return {
      id: item.cityId || item.id,
      cityId: item.cityId || item.id,
      countryId,
      name: data.names?.he || data.names?.en || data.name || item.id,
      description: data.description,
      names: data.names,
      identity: { names: data.names },
      countryNames: data.countryNames,
      countryName: data.countryNames?.he || data.description || countryId,
      stats: { recommendationCount: data.recommendationCount || data.recommendationsCount || 0 },
      placeholderColor,
    };
  },
}));

jest.mock('firebase/firestore', () => ({
  getDocs: jest.fn(),
  query: jest.fn((...args) => ({ __type: 'query', args })),
  collection: jest.fn(() => ({ __type: 'collection' })),
  collectionGroup: jest.fn(() => ({ __type: 'collectionGroup' })),
  orderBy: jest.fn((...args) => ({ __type: 'orderBy', args })),
  limit: jest.fn((...args) => ({ __type: 'limit', args })),
  where: jest.fn((...args) => ({ __type: 'where', args })),
  onSnapshot: jest.fn(() => () => {}),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

jest.mock('../src/config/firebase', () => ({
  db: { __type: 'db' },
}));

jest.mock('../src/components/GooglePlacesInput', () => {
  const React = require('react');
  const { View, TextInput, TouchableOpacity, Text } = require('react-native');
  return ({
    value, onChangeValue, rightAccessory, idleLocalResults = [], onSelectLocal,
    onSelect, returnSelection, inputWrapperStyle, inputWrapperTestID,
    inputStyle, searchIconSize, searchIconStyle,
  }) => {
    const [focused, setFocused] = React.useState(false);
    return (
      <View>
        <View testID={inputWrapperTestID} style={inputWrapperStyle}>
          <View testID="home-search-icon" size={searchIconSize} style={searchIconStyle} />
          <TextInput
            testID="home-search-input"
            style={inputStyle}
            value={value}
            onChangeText={onChangeValue}
            onFocus={() => setFocused(true)}
          />
        </View>
        {focused && !value && idleLocalResults.map((city) => (
          <TouchableOpacity
            key={`${city.countryId}:${city.id}`}
            testID={`mock-recent-${city.countryId}-${city.id}`}
            onPress={() => onSelectLocal(city)}
          >
            <Text>{city.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          testID="mock-google-result"
          onPress={() => onSelect?.(returnSelection ? {
            selectionId: 'selection-1',
            sessionId: 'session-1',
            providerPlaceId: 'google-place-1',
          } : 'google-place-1')}
        >
          <Text>Google result</Text>
        </TouchableOpacity>
        {rightAccessory}
      </View>
    );
  };
});

jest.mock('../src/utils/recentDiscoveryDestinations', () => ({
  loadRecentDiscoveryDestinations: (...args) => mockLoadRecentDestinations(...args),
  rememberDiscoveryDestinations: (...args) => mockRememberRecentDestinations(...args),
}));

jest.mock('../src/components/PageHeader', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  return ({ children, title, renderStart, renderEnd, ...props }) => ReactModule.createElement(
    View,
    props,
    renderStart?.(),
    title ? ReactModule.createElement(Text, null, title) : null,
    renderEnd?.(),
    children
  );
});

jest.mock('../src/components/CityCard', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return ({ city, onPress }) => (
    <TouchableOpacity testID={`city-card-${city.id}`} onPress={onPress}>
      <Text testID="city-card">{city.name}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../src/services/LocationService', () => ({
  resolveDestinationForPlacePreview: (...args) => mockResolveDestinationForPlacePreview(...args),
}));

jest.mock('../src/services/ProfileService', () => ({
  saveNoyaOnboardingStatus: jest.fn(),
}));

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({
    user: null,
    loading: false,
    isGuest: true,
  }),
}));

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({ ensureCapability: (...args) => mockEnsureCapability(...args) }),
}));

describe('HomeScreenSearchTest', () => {
  const makeDoc = (id, countryId, data) => ({
    id,
    data: () => data,
    ref: { parent: { parent: { id: countryId } } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadRecentDestinations.mockResolvedValue([]);
    mockRememberRecentDestinations.mockImplementation(async (items) => items);
    mockEnsureCapability.mockResolvedValue(false);
    mockSearchDestinations.mockResolvedValue({
      items: [
        makeDoc('athens', 'gr', {
          name: 'אתונה',
          description: 'אתונה, יוון',
          recommendationsCount: 10,
        }),
        makeDoc('paris', 'fr', {
          name: 'פריז',
          description: 'פריז, צרפת',
          recommendationsCount: 8,
        }),
      ],
    });
    mockRequestDestinations.mockImplementation((...args) => ({
      requested: true,
      source: 'network',
      promise: mockSearchDestinations(...args),
    }));
  });

  it('preserves the resolved exact venue and save token when Home prefills a recommendation', async () => {
    mockEnsureCapability.mockResolvedValue(true);
    const exactPlace = {
      placeId: 'google-place-1',
      name: 'One Budget Hotel Chiangrai Soi Sawan',
      address: 'Chiang Rai, Thailand',
      coordinates: { latitude: 19.887, longitude: 99.832 },
      resolvedPlaceToken: 'resolved-token',
      incidentId: 'loc_incident',
    };
    mockResolveDestinationForPlacePreview.mockResolvedValue({
      persisted: false,
      place: exactPlace,
      destination: {
        country: { id: 'TH', name: 'Thailand' },
        city: {
          id: 'chiang-rai',
          name: 'Chiang Rai',
          coordinates: { latitude: 19.91, longitude: 99.84 },
        },
      },
    });
    const navigationMock = { navigate: jest.fn() };
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={navigationMock} />
      </SafeAreaProvider>
    );

    fireEvent.press(screen.getByTestId('mock-google-result'));

    await waitFor(() => {
      expect(mockResolveDestinationForPlacePreview).toHaveBeenCalledWith({
        selectionId: 'selection-1',
        sessionId: 'session-1',
        providerPlaceId: 'google-place-1',
      });
      expect(navigationMock.navigate).toHaveBeenCalledWith('AddRecommendation', {
        prefillLocation: {
          destination: {
            country: { id: 'TH', name: 'Thailand' },
            city: expect.objectContaining({ id: 'chiang-rai' }),
          },
          place: exactPlace,
        },
      });
    });
  });

  it('opens a recent destination without another catalog or Google request', async () => {
    mockLoadRecentDestinations.mockResolvedValue([{
      countryId: 'FR',
      cityId: 'paris',
      name: 'פריז',
      countryName: 'צרפת',
      label: 'פריז · צרפת',
    }]);
    const navigationMock = { navigate: jest.fn() };
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={navigationMock} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockLoadRecentDestinations).toHaveBeenCalledTimes(1));
    fireEvent(screen.getByTestId('home-search-input'), 'focus');
    fireEvent.press(await screen.findByTestId('mock-recent-FR-paris'));

    await waitFor(() => {
      expect(navigationMock.navigate).toHaveBeenCalledWith('LandingPage', {
        cityId: 'paris',
        countryId: 'FR',
      });
      expect(mockRememberRecentDestinations).toHaveBeenCalledWith([expect.objectContaining({
        countryId: 'FR',
        cityId: 'paris',
        name: 'פריז',
      })]);
    });
    expect(mockSearchDestinations).toHaveBeenCalledTimes(1);
  });

  it('filters destinations when searching by text', async () => {
    const navigationMock = { navigate: jest.fn() };
    const { getByTestId, queryAllByTestId, queryByTestId, queryByText } = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={navigationMock} />
      </SafeAreaProvider>
    );

    // Wait for initial destinations to load.
    await waitFor(() => {
      expect(mockSearchDestinations).toHaveBeenCalledTimes(1);
    });

    // Search for "יוון" and expect the list to change.
    fireEvent.changeText(getByTestId('home-search-input'), 'יוון');
    await waitFor(() => {
      expect(queryAllByTestId('city-card')).toHaveLength(1);
      expect(getByTestId('city-card-athens')).toBeTruthy();
      expect(queryByTestId('city-card-paris')).toBeNull();
    });
    expect(getByTestId('home-results-title')).toHaveTextContent('תוצאות חיפוש');
    expect(queryByTestId('home-preferences-prompt')).toBeNull();
    expect(queryByText('מומלצים עכשיו')).toBeNull();
    expect(queryByText('יעדים פופולריים')).toBeNull();

    fireEvent.press(getByTestId('city-card-athens'));
    expect(navigationMock.navigate).toHaveBeenCalledWith('LandingPage', {
      cityId: 'athens',
      countryId: 'gr',
    });

    const callsBeforePunctuation = mockSearchDestinations.mock.calls.length;
    // Punctuation-only input is not a searchable query and must not trigger another catalog request.
    fireEvent.changeText(getByTestId('home-search-input'), '!@#');
    await waitFor(() => expect(queryByTestId('home-results-title')).toBeNull());
    expect(mockSearchDestinations).toHaveBeenCalledTimes(callsBeforePunctuation);
    expect(queryByText('מומלצים עכשיו')).toBeTruthy();
    expect(queryByText('יעדים פופולריים')).toBeTruthy();
  });

  it('shows a remote catalog destination when punctuation and spacing differ', async () => {
    mockSearchDestinations.mockImplementation(async (payload = {}) => ({
      items: payload.query ? [{
        cityId: 'st-johns',
        countryId: 'CA',
        names: { he: 'סנט ג׳ונס', en: 'St. John’s' },
        countryNames: { he: 'קנדה', en: 'Canada' },
        recommendationCount: 2,
      }] : [],
    }));
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={{ navigate: jest.fn() }} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(1));
    fireEvent.changeText(screen.getByTestId('home-search-input'), 'st johns');

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledWith(expect.objectContaining({
      query: 'st johns',
    })));
    await waitFor(() => expect(screen.getByTestId('city-card-st-johns')).toBeTruthy());
  });

  it('opens a destination-only filter with real sort controls', async () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={{ navigate: jest.fn() }} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(1));
    expect(screen.getByText('לאן נוסעים?')).toBeTruthy();
    expect(screen.getByText('מומלצים עכשיו')).toBeTruthy();
    expect(screen.queryByText('חם עכשיו')).toBeNull();
    expect(screen.queryByText('בחירת הקהילה')).toBeNull();
    expect(screen.queryByText('חדש')).toBeNull();
    fireEvent.press(screen.getByLabelText('סינון יעדים'));
    expect(screen.getByText('סינון יעדים')).toBeTruthy();
    expect(screen.getByText('הכי פופולריים')).toBeTruthy();
    expect(screen.getByText('לפי שם א–ת')).toBeTruthy();
    expect(screen.getByText('מועדפים בלבד')).toBeTruthy();
    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(2));
  });

  it('keeps the shared Home hero outside the scrolling body', async () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={{ navigate: jest.fn() }} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(1));
    const header = screen.getByTestId('home-tab-header');
    const scroll = screen.getByTestId('home-scroll');
    expect(header.props.overlapNext).toBe(true);
    expect(header.props.rootRef).toBeTruthy();
    expect(header.props.onLayout).toEqual(expect.any(Function));
    expect(screen.queryByTestId('noya-tour-target-main-home')).toBeNull();
    expect(within(header).getByText('לאן נוסעים?')).toBeTruthy();
    expect(within(header).getByTestId('home-search-input')).toBeTruthy();
    expect(StyleSheet.flatten(within(header).getByTestId('home-search-row').props.style)).toMatchObject({
      width: '100%',
      marginTop: 12,
      gap: 8,
    });
    expect(StyleSheet.flatten(within(header).getByTestId('home-search-field').props.style)).toMatchObject({
      width: '100%',
      height: 48,
      borderRadius: 16,
      paddingHorizontal: 14,
      flexDirection: 'row-reverse',
      gap: 9,
    });
    expect(within(header).getByTestId('home-search-icon').props.size).toBe(19);
    expect(StyleSheet.flatten(within(header).getByTestId('home-search-icon').props.style)).toMatchObject({
      position: 'relative',
      top: 0,
      right: 0,
    });
    expect(StyleSheet.flatten(within(header).getByTestId('home-search-input').props.style)).toMatchObject({
      height: '100%',
      fontSize: 15,
      paddingLeft: 0,
      paddingRight: 0,
      textAlign: 'right',
    });
    expect(StyleSheet.flatten(within(header).getByTestId('home-filter-button').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(within(scroll).queryByTestId('home-tab-header')).toBeNull();
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ paddingTop: 28 });
  });

  it('does not refresh or displace Home when entering it from another tab', async () => {
    let handleTabPress;
    const tabNavigation = {
      addListener: jest.fn((event, handler) => {
        if (event === 'tabPress') handleTabPress = handler;
        return jest.fn();
      }),
      isFocused: jest.fn(() => false),
    };
    render(
      <NavigationContext.Provider value={tabNavigation}>
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 44, left: 0, right: 0, bottom: 34 },
          }}
        >
          <HomeScreen navigation={{ navigate: jest.fn() }} />
        </SafeAreaProvider>
      </NavigationContext.Provider>
    );

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(1));
    act(() => handleTabPress());
    expect(mockSearchDestinations).toHaveBeenCalledTimes(1);
  });

  it('lets the hero own the top safe area without an automatic iOS inset', async () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={{ navigate: jest.fn() }} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(1));
    const scroll = screen.getByTestId('home-scroll');
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('never');
    expect(scroll.props.automaticallyAdjustContentInsets).toBe(false);
    expect(scroll.props.automaticallyAdjustsScrollIndicatorInsets).toBe(false);
    expect(scroll.props.contentInset).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(scroll.props.scrollIndicatorInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(scroll.props.contentOffset).toEqual({ x: 0, y: 0 });
    expect(StyleSheet.flatten(scroll.props.style).backgroundColor).toBe('#28486D');
  });

  it('keeps the Home header and replaces discovery content while refresh is pending', async () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={{ navigate: jest.fn() }} />
      </SafeAreaProvider>
    );
    await waitFor(() => expect(screen.getByText('מומלצים עכשיו')).toBeTruthy());

    const pendingRefresh = deferred();
    mockSearchDestinations.mockReturnValueOnce(pendingRefresh.promise);
    const control = screen.UNSAFE_getByType(RefreshControl);
    let refreshPromise;
    act(() => {
      refreshPromise = control.props.onRefresh();
    });

    expect(screen.getByTestId('home-tab-header')).toBeTruthy();
    expect(screen.getByTestId('home-refresh-state')).toBeTruthy();
    expect(screen.queryByText('מומלצים עכשיו')).toBeNull();

    await act(async () => {
      pendingRefresh.resolve({ items: [] });
      await refreshPromise;
    });
    expect(screen.queryByTestId('home-refresh-state')).toBeNull();
  });

  it('shows an up-to-date confirmation without another server call inside the fresh window', async () => {
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <HomeScreen navigation={{ navigate: jest.fn() }} />
      </SafeAreaProvider>
    );
    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledTimes(1));
    const cached = await mockSearchDestinations.mock.results[0].value;
    mockRequestDestinations.mockImplementation(() => ({
      requested: false,
      source: 'fresh-cache',
      promise: Promise.resolve(cached),
    }));

    let refreshPromise;
    act(() => {
      refreshPromise = screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(screen.getByTestId('home-refresh-confirmation')).toBeTruthy();
    expect(mockSearchDestinations).toHaveBeenCalledTimes(1);

    await act(async () => refreshPromise);
    expect(screen.queryByTestId('home-refresh-confirmation')).toBeNull();
    expect(mockSearchDestinations).toHaveBeenCalledTimes(1);
  });
});
