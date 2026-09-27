import React from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LandingPageScreen from '../src/features/destination/screens/LandingPageScreen';

const mockUseDestinationData = jest.fn();
const mockUseCityDiscovery = jest.fn();
jest.mock('../src/features/destination/hooks/useCityDiscovery', () => ({ useCityDiscovery: (...args) => mockUseCityDiscovery(...args) }));
jest.mock('../src/features/destination/components/CityMapSection', () => {
  const { Text, View } = require('react-native');
  return (props) => <View testID="city-map-section" {...props}><Text>העיר על המפה</Text></View>;
});
jest.mock('../src/features/destination/components/CityFilterModal', () => {
  const { View } = require('react-native'); return (props) => <View testID="city-filter" {...props} />;
});
jest.mock('../src/features/roadtrip/components/RouteCard', () => {
  const { Text, Pressable } = require('react-native'); return { RouteCard: ({ item, onPress }) => <Pressable onPress={onPress}><Text>{item.title}</Text></Pressable> };
});
jest.mock('../src/components/CommentsModal', () => ({ CommentsModal: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));

jest.mock('../src/features/destination/hooks/useDestinationData', () => ({
  useDestinationData: (...args) => mockUseDestinationData(...args),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }) => <Text>{name}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon, MaterialIcons: Icon };
});

jest.mock('../src/components/CachedImage', () => {
  const { View } = require('react-native');
  return (props) => <View testID="hero-image" {...props} />;
});

jest.mock('../src/components/FavoriteButton', () => {
  const { View } = require('react-native');
  return () => <View testID="favorite-button" />;
});

jest.mock('../src/features/moderation/components/ReportButton', () => {
  const { View } = require('react-native');
  return (props) => <View testID="report-destination" {...props} />;
});

jest.mock('../src/features/profile/context/PersonalizationFeedbackContext', () => ({
  usePersonalizationFeedback: () => ({ hide: jest.fn(), isHidden: () => false }),
}));

jest.mock('../src/components/RecommendationCard', () => {
  const { Text, View } = require('react-native');
  return ({ item }) => (
    <View testID={`recommendation-${item.id}`}>
      <Text>{item.title}</Text>
    </View>
  );
});

const overview = {
  destination: {
    cityId: 'mykonos',
    countryId: 'gr',
    name: 'מיקונוס',
    countryName: 'יוון',
    heroImageUrl: 'https://example.com/mykonos.jpg',
    thumbnailUrl: 'https://example.com/mykonos.jpg',
    travelers: 128,
  },
  quickFacts: {
    weather: { temperatureC: 24, description: 'בהיר', conditionCode: 'clear' },
    closestAirport: {
      name: 'Mykonos Airport',
      iataCode: 'JMK',
      distanceKm: 2.1,
    },
    currency: { code: 'EUR', symbol: '€', ilsRate: 0.25 },
  },
  essentialFacts: {
    languages: [{ code: 'el', labelHe: 'יוונית' }],
    callingCodes: ['+30'],
  },
  sources: {
    weather: {
      name: 'OpenWeather',
      updatedAt: '2026-08-05',
      url: 'https://openweathermap.org/',
    },
  },
};

const recommendations = [
  { id: 'food', title: 'מסעדה מקומית', categoryId: 'food', tags: [] },
  { id: 'bus', title: 'המלצת אוטובוס', categoryId: 'transportation', tags: ['public_transit'] },
  { id: 'sim', title: 'חבילת גלישה', categoryId: 'services', tags: ['sim_esim'] },
];

beforeEach(() => {
  mockUseCityDiscovery.mockImplementation(({ kind }) => ({ items: kind === 'routes' ? [{ id: 'route1', title: 'יום בעיר' }] : recommendations, loading: false, error: null, retry: jest.fn(), removeItem: jest.fn() }));
  mockUseDestinationData.mockReturnValue({
    overview,
    recommendations,
    loading: false,
    error: null,
  });
});

test('renders the open facts, wide airport row and city map without unsupported data', () => {
  const screen = render(
    <LandingPageScreen
      navigation={{ goBack: jest.fn() }}
      route={{ params: { countryId: 'gr', cityId: 'mykonos' } }}
    />
  );
  expect(screen.getByText('מיקונוס')).toBeTruthy();
  expect(screen.getByText('במבט מהיר')).toBeTruthy();
  expect(screen.getByText('מידע שימושי')).toBeTruthy();
  expect(screen.getByText('מהמטיילים, בשבילכם')).toBeTruthy();
  expect(screen.getByText('העיר על המפה')).toBeTruthy();
  expect(screen.queryByText('לא זמין')).toBeNull();
  expect(screen.queryByText('מלון מומלץ')).toBeNull();
  expect(screen.queryByText('נהג מומלץ')).toBeNull();
  expect(screen.queryByText('תכנון טיול')).toBeNull();
  expect(screen.getByTestId('report-destination').props.target).toEqual({
    type: 'destination', id: 'mykonos', cityId: 'mykonos', countryId: 'gr',
  });
  expect(screen.getByText('24°')).toBeTruthy();
  expect(screen.getByText('Mykonos Airport')).toBeTruthy();
  expect(screen.getByText('יוונית')).toBeTruthy();

});

test('keeps independent city search and filter state across tabs and opens canonical routes', () => {
  const navigate = jest.fn();
  const screen = render(<LandingPageScreen navigation={{ goBack: jest.fn(), navigate }} route={{ params: { countryId: 'gr', cityId: 'mykonos' } }} />);
  fireEvent.changeText(screen.getByLabelText('חיפוש המלצה בעיר'), 'דגים');
  fireEvent.press(screen.getByRole('tab', { name: 'מסלולים' }));
  expect(screen.getByLabelText('חיפוש מסלול בעיר').props.value).toBe('');
  fireEvent.changeText(screen.getByLabelText('חיפוש מסלול בעיר'), 'יום');
  fireEvent.press(screen.getByText('יום בעיר'));
  expect(navigate).toHaveBeenCalledWith('RouteDetail', { routeId: 'route1' });
  fireEvent.press(screen.getByRole('tab', { name: 'המלצות' }));
  expect(screen.getByLabelText('חיפוש המלצה בעיר').props.value).toBe('דגים');
  fireEvent.press(screen.getByLabelText('סינון המלצות בעיר'));
  const filter = screen.getByTestId('city-filter');
  expect(filter.props.visible).toBe(true);
  fireEvent(filter, 'apply', { query: 'דגים', needIds: ['kosher', 'wheelchair_accessible'] });
  expect(mockUseCityDiscovery).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'mykonos', countryId: 'gr', filters: expect.objectContaining({ needIds: ['kosher', 'wheelchair_accessible'] }) }));
});

test('keeps destination facts available when the community request fails', () => {
  const retry = jest.fn();
  mockUseCityDiscovery.mockReturnValue({ items: [], loading: false, error: 'offline', retry });
  const screen = render(<LandingPageScreen navigation={{ goBack: jest.fn() }} route={{ params: { countryId: 'gr', cityId: 'mykonos' } }} />);
  expect(screen.getByText('מידע שימושי')).toBeTruthy();
  expect(screen.getByText('Mykonos Airport')).toBeTruthy();
  fireEvent.press(screen.getByText('ניסיון נוסף'));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('handles an unavailable external source without an unhandled rejection', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('unavailable'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = render(
    <LandingPageScreen
      navigation={{ goBack: jest.fn() }}
      route={{ params: { countryId: 'gr', cityId: 'mykonos' } }}
    />
  );

  fireEvent.press(screen.getByLabelText('מקורות ועדכון'));
  fireEvent.press(screen.getByLabelText(/OpenWeather/));

  await waitFor(() => expect(alert).toHaveBeenCalledWith(
    'לא ניתן לפתוח את הקישור',
    'אפשר לנסות שוב מאוחר יותר.'
  ));
  expect(openUrl).toHaveBeenCalledWith('https://openweathermap.org/');

  openUrl.mockRestore();
  alert.mockRestore();
});

test('does not expose a stored source URL outside the source-specific allowlist', () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue();
  mockUseDestinationData.mockReturnValue({
    overview: {
      ...overview,
      sources: {
        weather: {
          ...overview.sources.weather,
          url: 'https://openweathermap.org.evil.example/phishing',
        },
      },
    },
    recommendations,
    loading: false,
    error: null,
  });
  const screen = render(
    <LandingPageScreen
      navigation={{ goBack: jest.fn() }}
      route={{ params: { countryId: 'gr', cityId: 'mykonos' } }}
    />
  );

  fireEvent.press(screen.getByLabelText('מקורות ועדכון'));
  const sourceRow = screen.getByLabelText('מזג אוויר: OpenWeather');
  expect(sourceRow.props.accessibilityRole).toBeUndefined();
  fireEvent.press(sourceRow);
  expect(openUrl).not.toHaveBeenCalled();

  openUrl.mockRestore();
});

test('back control uses the RTL-facing action on the leading edge', () => {
  const goBack = jest.fn();
  const screen = render(
    <LandingPageScreen
      navigation={{ goBack }}
      route={{ params: { countryId: 'gr', cityId: 'mykonos' } }}
    />
  );
  fireEvent.press(screen.getByLabelText('חזרה'));
  expect(goBack).toHaveBeenCalledTimes(1);
});
