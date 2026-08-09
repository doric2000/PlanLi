import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import LandingPageScreen from '../src/features/destination/screens/LandingPageScreen';

const mockUseDestinationData = jest.fn();

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
    weather: { name: 'OpenWeather', updatedAt: '2026-08-05' },
  },
};

const recommendations = [
  { id: 'food', title: 'מסעדה מקומית', categoryId: 'food', tags: [] },
  { id: 'bus', title: 'המלצת אוטובוס', categoryId: 'transportation', tags: ['public_transit'] },
  { id: 'sim', title: 'חבילת גלישה', categoryId: 'services', tags: ['sim_esim'] },
];

beforeEach(() => {
  mockUseDestinationData.mockReturnValue({
    overview,
    recommendations,
    loading: false,
    error: null,
  });
});

test('renders the approved neutral destination hierarchy without unsupported placeholders', () => {
  const screen = render(
    <LandingPageScreen
      navigation={{ goBack: jest.fn() }}
      route={{ params: { countryId: 'gr', cityId: 'mykonos' } }}
    />
  );
  expect(screen.getByText('מיקונוס')).toBeTruthy();
  expect(screen.getByText('במבט מהיר')).toBeTruthy();
  expect(screen.getByText('מידע שימושי')).toBeTruthy();
  expect(screen.getByText('טיפים מהקהילה')).toBeTruthy();
  expect(screen.queryByText('לא זמין')).toBeNull();
  expect(screen.queryByText('מלון מומלץ')).toBeNull();
  expect(screen.queryByText('נהג מומלץ')).toBeNull();
  expect(screen.queryByText('תכנון טיול')).toBeNull();
});

test('community filters work in place and source details are progressively disclosed', () => {
  const screen = render(
    <LandingPageScreen
      navigation={{ goBack: jest.fn() }}
      route={{ params: { countryId: 'gr', cityId: 'mykonos' } }}
    />
  );
  fireEvent.press(screen.getByTestId('destination-filter-transportation'));
  expect(screen.getByText('המלצת אוטובוס')).toBeTruthy();
  expect(screen.queryByText('מסעדה מקומית')).toBeNull();

  expect(screen.queryByText('OpenWeather')).toBeNull();
  fireEvent.press(screen.getByLabelText('מקורות ועדכון'));
  expect(screen.getByText(/OpenWeather/)).toBeTruthy();
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
