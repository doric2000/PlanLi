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
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from '../src/features/home/screens/HomeScreen';
import { getDocs } from 'firebase/firestore';

jest.mock('firebase/firestore', () => ({
  getDocs: jest.fn(),
  query: jest.fn((...args) => ({ __type: 'query', args })),
  collectionGroup: jest.fn(() => ({ __type: 'collectionGroup' })),
  orderBy: jest.fn((...args) => ({ __type: 'orderBy', args })),
  limit: jest.fn((...args) => ({ __type: 'limit', args })),
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
  const { View, TextInput } = require('react-native');
  return ({ value, onChangeValue }) => (
    <View>
      <TextInput
        testID="home-search-input"
        value={value}
        onChangeText={onChangeValue}
      />
    </View>
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
  getOrCreateDestination: jest.fn(),
}));

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({
    user: null,
    loading: false,
    isGuest: true,
  }),
}));

describe('HomeScreenSearchTest', () => {
  const makeDoc = (id, countryId, data) => ({
    id,
    data: () => data,
    ref: { parent: { parent: { id: countryId } } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getDocs.mockResolvedValue({
      docs: [
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

  it('filters destinations when searching by text', async () => {
    const navigationMock = { navigate: jest.fn() };
    const { getByTestId, queryAllByTestId, getByText, queryByTestId } = render(
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
      expect(queryAllByTestId('city-card')).toHaveLength(2);
    });

    // Search for "יוון" and expect the list to change.
    fireEvent.changeText(getByTestId('home-search-input'), 'יוון');
    await waitFor(() => {
      expect(queryAllByTestId('city-card')).toHaveLength(1);
      expect(getByTestId('city-card-athens')).toBeTruthy();
      expect(queryByTestId('city-card-paris')).toBeNull();
    });

    fireEvent.press(getByTestId('city-card-athens'));
    expect(navigationMock.navigate).toHaveBeenCalledWith('LandingPage', {
      cityId: 'athens',
      countryId: 'gr',
    });

    // Search for "!@#" and expect empty results.
    fireEvent.changeText(getByTestId('home-search-input'), '!@#');
    await waitFor(() => {
      expect(queryAllByTestId('city-card')).toHaveLength(0);
      expect(getByTestId('home-empty-state')).toBeTruthy();
      expect(getByText('לא נמצאו יעדים')).toBeTruthy();
    });
  });
});
