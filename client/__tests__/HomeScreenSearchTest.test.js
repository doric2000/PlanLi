/**
 * Purpose: Verify the Home planning hub, its independent discovery modules,
 * destination search, refresh behavior, and navigation entry points.
 */
import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import { act, render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import HomeScreen from '../src/features/home/screens/HomeScreen';

const mockSearchDestinations = jest.fn();
const mockLoadRecentDestinations = jest.fn();
const mockRememberRecentDestinations = jest.fn();
const mockResolveDestinationForPlacePreview = jest.fn();
const mockEnsureCapability = jest.fn();
const mockRequestPersonalizedRoutes = jest.fn();
const mockRequestPersonalizedRecommendations = jest.fn();
const mockGetCurrentRouteDraft = jest.fn();
const mockFocusSearchInput = jest.fn();
const mockWaitForRefreshConfirmation = jest.fn(() => (
  new Promise((resolve) => setTimeout(resolve, 300))
));
const mockAuthUserState = {
  user: null,
  loading: false,
  isGuest: true,
  isActive: false,
};
const mockSmartProfileState = {
  completed: false,
  loading: false,
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
jest.mock('../src/services/DestinationService', () => ({
  searchDestinations: (...args) => mockSearchDestinations(...args),
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

jest.mock('../src/services/PersonalizationService', () => ({
  requestPersonalizedRoutes: (...args) => mockRequestPersonalizedRoutes(...args),
  requestPersonalizedRecommendations: (...args) => mockRequestPersonalizedRecommendations(...args),
}));

jest.mock('../src/services/RouteService', () => ({
  getCurrentRouteDraft: (...args) => mockGetCurrentRouteDraft(...args),
}));

jest.mock('../src/utils/refreshFeedback', () => ({
  waitForRefreshConfirmation: (...args) => mockWaitForRefreshConfirmation(...args),
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
    inputStyle, inputRef, searchIconSize, searchIconStyle,
  }) => {
    const [focused, setFocused] = React.useState(false);
    React.useImperativeHandle(inputRef, () => ({ focus: mockFocusSearchInput }), [inputRef]);
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
  useAuthUser: () => mockAuthUserState,
}));

jest.mock('../src/hooks/useSmartProfile', () => ({
  useSmartProfile: () => mockSmartProfileState,
}));

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    ensureCapability: (...args) => mockEnsureCapability(...args),
    handleCallableAuthError: jest.fn(),
    userDocument: null,
  }),
}));

jest.mock('../src/features/profile/services/NoyaOnboardingStorage', () => ({
  dismissGuestNoya: jest.fn(async () => undefined),
  loadGuestNoyaProfile: jest.fn(async () => null),
  NOYA_ONBOARDING_VERSION: 2,
  shouldInviteGuestToNoya: jest.fn(async () => false),
  wasNoyaAccountHandled: jest.fn(() => true),
}));

describe('HomeScreenSearchTest', () => {
  const makeDoc = (id, countryId, data) => ({
    id,
    data: () => data,
    ref: { parent: { parent: { id: countryId } } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthUserState, {
      user: null,
      loading: false,
      isGuest: true,
      isActive: false,
    });
    Object.assign(mockSmartProfileState, { completed: false, loading: false });
    mockLoadRecentDestinations.mockResolvedValue([]);
    mockRememberRecentDestinations.mockImplementation(async (items) => items);
    mockEnsureCapability.mockResolvedValue(false);
    mockGetCurrentRouteDraft.mockResolvedValue(null);
    mockRequestPersonalizedRoutes.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({ mode: 'generic', items: [] }),
    }));
    mockRequestPersonalizedRecommendations.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({ mode: 'generic', items: [] }),
    }));
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
  });

  it('opens as a useful planning hub without requesting popularity-ranked destinations', async () => {
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

    await waitFor(() => expect(screen.getByTestId('home-continuation-new')).toBeTruthy());
    expect(screen.getByText('מה אפשר לעשות עכשיו?')).toBeTruthy();
    expect(screen.getByText('מסלולים חדשים')).toBeTruthy();
    expect(screen.getByText('חדש מהקהילה')).toBeTruthy();
    expect(mockRequestPersonalizedRoutes).toHaveBeenCalledWith({ sort: 'newest', limit: 4 });
    expect(mockRequestPersonalizedRecommendations).toHaveBeenCalledWith({ sort: 'newest', limit: 4 });
    expect(mockSearchDestinations).not.toHaveBeenCalled();
    expect(screen.queryByText('יעדים פופולריים')).toBeNull();
  });

  it('focuses destination search when there is no trip or recent destination to continue', async () => {
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

    await waitFor(() => expect(screen.getByTestId('home-continuation-new')).toBeTruthy());
    fireEvent.press(screen.getByTestId('home-continuation-action'));
    expect(mockFocusSearchInput).toHaveBeenCalledTimes(1);
  });

  it('prioritizes an active draft and uses personalized rails for a completed account', async () => {
    Object.assign(mockAuthUserState, {
      user: { uid: 'user-1' },
      isGuest: false,
      isActive: true,
    });
    Object.assign(mockSmartProfileState, { completed: true, loading: false });
    mockEnsureCapability.mockResolvedValue(true);
    mockGetCurrentRouteDraft.mockResolvedValue({
      id: 'draft-1',
      title: 'סוף שבוע בבודפשט',
      area: { cityName: 'בודפשט', countryName: 'הונגריה' },
      dayCount: 2,
      days: [{ stops: [{ id: 'a' }, { id: 'b' }] }, { stops: [] }],
    });
    mockRequestPersonalizedRoutes.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({ mode: 'personalized', items: [] }),
    }));
    mockRequestPersonalizedRecommendations.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({ mode: 'personalized', items: [] }),
    }));
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

    await waitFor(() => expect(screen.getByTestId('home-continuation-draft')).toBeTruthy());
    expect(screen.getByText('סוף שבוע בבודפשט')).toBeTruthy();
    expect(screen.getByText(/2 ימים/)).toBeTruthy();
    expect(screen.getByText('מסלולים שמתאימים לך')).toBeTruthy();
    expect(screen.getByText('המלצות בשבילך')).toBeTruthy();
    expect(mockRequestPersonalizedRoutes).toHaveBeenCalledWith({ sort: 'forYou', limit: 4 });

    fireEvent.press(screen.getByTestId('home-continuation-action'));
    await waitFor(() => expect(navigationMock.navigate).toHaveBeenCalledWith('AddRoutesScreen'));
  });

  it('keeps a loaded route draft available when a refresh cannot update it', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    Object.assign(mockAuthUserState, {
      user: { uid: 'user-1' },
      isGuest: false,
      isActive: true,
    });
    Object.assign(mockSmartProfileState, { completed: true, loading: false });
    mockGetCurrentRouteDraft.mockResolvedValue({
      id: 'draft-1',
      title: 'סוף שבוע בבודפשט',
      area: { cityName: 'בודפשט', countryName: 'הונגריה' },
      dayCount: 2,
      days: [{ stops: [{ id: 'a' }] }, { stops: [] }],
    });
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

    await waitFor(() => expect(screen.getByTestId('home-continuation-draft')).toBeTruthy());
    mockGetCurrentRouteDraft.mockRejectedValueOnce(new Error('offline'));
    let refreshPromise;
    act(() => {
      refreshPromise = screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    await act(async () => refreshPromise);

    expect(screen.getByTestId('home-continuation-draft')).toBeTruthy();
    expect(screen.getByText('סוף שבוע בבודפשט')).toBeTruthy();
    expect(screen.getByTestId('home-continuation-stale-error')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('keeps one discovery rail useful when the other rail fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRequestPersonalizedRoutes.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.reject(new Error('offline')),
    }));
    mockRequestPersonalizedRecommendations.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({
        mode: 'generic',
        items: [{ id: 'rec-1', title: 'בית קפה קטן בפירנצה', destination: { cityName: 'פירנצה' } }],
      }),
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

    await waitFor(() => expect(screen.getByTestId('home-route-error')).toBeTruthy());
    expect(screen.getByTestId('home-recommendation-card-rec-1')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('preserves loaded discovery cards and avoids a false success when refresh fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRequestPersonalizedRoutes.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({
        mode: 'generic',
        items: [{ id: 'route-1', title: 'יומיים בצפון איטליה', dayCount: 2 }],
      }),
    }));
    mockRequestPersonalizedRecommendations.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.resolve({
        mode: 'generic',
        items: [{ id: 'rec-1', title: 'בית קפה קטן בפירנצה' }],
      }),
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

    await waitFor(() => expect(screen.getByTestId('home-route-card-route-1')).toBeTruthy());
    expect(screen.getByTestId('home-recommendation-card-rec-1')).toBeTruthy();
    mockRequestPersonalizedRoutes.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.reject(new Error('offline')),
    }));
    mockRequestPersonalizedRecommendations.mockImplementation(() => ({
      requested: true,
      source: 'network',
      promise: Promise.reject(new Error('offline')),
    }));

    let refreshPromise;
    act(() => {
      refreshPromise = screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(screen.getByTestId('home-refresh-state')).toBeTruthy();
    await act(async () => refreshPromise);

    expect(mockWaitForRefreshConfirmation).not.toHaveBeenCalled();
    expect(screen.queryByTestId('home-refresh-confirmation')).toBeNull();
    expect(screen.getByTestId('home-route-card-route-1')).toBeTruthy();
    expect(screen.getByTestId('home-recommendation-card-rec-1')).toBeTruthy();
    expect(screen.getByTestId('home-route-stale-error')).toBeTruthy();
    expect(screen.getByTestId('home-recommendation-stale-error')).toBeTruthy();
    consoleSpy.mockRestore();
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
    expect(mockSearchDestinations).not.toHaveBeenCalled();
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

    await waitFor(() => expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1));
    expect(mockSearchDestinations).not.toHaveBeenCalled();

    // Search for "יוון" and expect the list to change.
    fireEvent.changeText(getByTestId('home-search-input'), 'יוון');
    await waitFor(() => {
      expect(queryAllByTestId('city-card')).toHaveLength(1);
      expect(getByTestId('city-card-athens')).toBeTruthy();
      expect(queryByTestId('city-card-paris')).toBeNull();
    });
    expect(getByTestId('home-results-title')).toHaveTextContent('תוצאות חיפוש');
    expect(queryByTestId('home-preferences-prompt')).toBeNull();
    expect(queryByText('מה אפשר לעשות עכשיו?')).toBeNull();
    expect(queryByText('מסלולים חדשים')).toBeNull();

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
    expect(queryByText('מה אפשר לעשות עכשיו?')).toBeTruthy();
    expect(queryByText('מסלולים חדשים')).toBeTruthy();
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

    await waitFor(() => expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1));
    expect(mockSearchDestinations).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('home-search-input'), 'st johns');

    await waitFor(() => expect(mockSearchDestinations).toHaveBeenCalledWith(expect.objectContaining({
      query: 'st johns',
    })));
    await waitFor(() => expect(screen.getByTestId('city-card-st-johns')).toBeTruthy());
  });

  it('opens a destination-only filter without unsupported popularity controls', async () => {
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

    await waitFor(() => expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1));
    expect(screen.getByText('מה מתכננים היום?')).toBeTruthy();
    expect(screen.getByText('מה אפשר לעשות עכשיו?')).toBeTruthy();
    expect(screen.queryByText('יעדים פופולריים')).toBeNull();
    fireEvent.press(screen.getByLabelText('סינון יעדים'));
    expect(screen.getByText('סינון יעדים')).toBeTruthy();
    expect(screen.getByText('יעדים שמורים')).toBeTruthy();
    expect(screen.queryByText('הכי פופולריים')).toBeNull();
    expect(screen.queryByText('לפי שם א–ת')).toBeNull();
    expect(screen.getByText('מועדפים בלבד')).toBeTruthy();
    expect(mockSearchDestinations).not.toHaveBeenCalled();
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

    await waitFor(() => expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1));
    const header = screen.getByTestId('home-tab-header');
    const scroll = screen.getByTestId('home-scroll');
    expect(header.props.overlapNext).toBe(true);
    expect(header.props.rootRef).toBeUndefined();
    expect(header.props.onLayout).toBeUndefined();
    expect(screen.getByTestId('home-search-tour-target').props.onLayout).toEqual(expect.any(Function));
    expect(within(header).getByText('מה מתכננים היום?')).toBeTruthy();
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

    await waitFor(() => expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1));
    act(() => handleTabPress());
    expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1);
    expect(mockSearchDestinations).not.toHaveBeenCalled();
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

    await waitFor(() => expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1));
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
    await waitFor(() => expect(screen.getByTestId('home-continuation-new')).toBeTruthy());

    const pendingRefresh = deferred();
    mockRequestPersonalizedRoutes.mockReturnValueOnce({
      requested: true,
      source: 'network',
      promise: pendingRefresh.promise,
    });
    const control = screen.UNSAFE_getByType(RefreshControl);
    let refreshPromise;
    act(() => {
      refreshPromise = control.props.onRefresh();
    });

    expect(screen.getByTestId('home-tab-header')).toBeTruthy();
    expect(screen.getByTestId('home-refresh-state')).toBeTruthy();
    expect(screen.queryByText('מה אפשר לעשות עכשיו?')).toBeNull();

    await act(async () => {
      pendingRefresh.resolve({ mode: 'generic', items: [] });
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
    await waitFor(() => expect(mockRequestPersonalizedRoutes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockRequestPersonalizedRecommendations).toHaveBeenCalledTimes(1));
    mockRequestPersonalizedRoutes.mockImplementation(() => ({
      requested: false,
      source: 'fresh-cache',
      promise: Promise.resolve({ mode: 'generic', items: [] }),
    }));
    mockRequestPersonalizedRecommendations.mockImplementation(() => ({
      requested: false,
      source: 'fresh-cache',
      promise: Promise.resolve({ mode: 'generic', items: [] }),
    }));

    let refreshPromise;
    act(() => {
      refreshPromise = screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    await waitFor(() => expect(screen.getByTestId('home-refresh-confirmation')).toBeTruthy());
    expect(mockSearchDestinations).not.toHaveBeenCalled();

    await act(async () => refreshPromise);
    expect(screen.queryByTestId('home-refresh-confirmation')).toBeNull();
    expect(mockSearchDestinations).not.toHaveBeenCalled();
  });
});
