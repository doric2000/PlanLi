import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Platform } from 'react-native';
import CityMapSection from '../src/features/destination/components/CityMapSection';
import { createDestinationStyles } from '../src/features/destination/components/destinationStyles';

const mockDiscovery = jest.fn();
const mockSelected = jest.fn();
let mockActive = true;
const mockEnsure = jest.fn();
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ user: mockActive ? { uid: 'alice' } : null, isActive: mockActive, ensureCapability: mockEnsure }) }));
jest.mock('../src/hooks/useRecommendationById', () => ({ useRecommendationById: (...args) => mockSelected(...args) }));
jest.mock('../src/features/moderation/BlockedUsersContext', () => ({ useBlockedUsers: () => ({ isBlocked: (id) => id === 'blocked' }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../src/features/destination/hooks/useCityDiscovery', () => ({ useCityDiscovery: (...args) => mockDiscovery(...args) }));
jest.mock('../src/features/destination/components/CityMapCanvas', () => {
  const { View } = require('react-native'); return (props) => <View {...props} testID="canvas" />;
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, SafeAreaProvider: ({ children }) => children }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native'); return { Ionicons: ({ name }) => <Text>{name}</Text> };
});
jest.mock('../src/components/CachedImage', () => require('react-native').View);
jest.mock('../src/components/FavoriteButton', () => () => null);
jest.mock('../src/components/ActionBar', () => {
  const { View } = require('react-native'); return (props) => <View testID="selected-actions" {...props} />;
});
const item = { id: 'one', title: 'מסעדת חוף', status: 'active', place: { coordinates: { lat: 6.8, lng: 81.8 } } };
const base = { destination: { name: 'ארוגם באי', identity: { coordinates: { lat: 6.8, lng: 81.8 } } }, cityId: 'bay', countryId: 'lk',
  recommendations: [item], filters: { query: '', categoryIds: [] }, onFiltersChange: jest.fn(), navigation: { navigate: jest.fn() }, onComments: jest.fn(), styles: createDestinationStyles() };
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); mockActive = true; mockDiscovery.mockReturnValue({ items: [item], loading: false, error: null, retry: jest.fn() }); mockSelected.mockReturnValue({ data: item, loading: false, resolved: true }); });
afterEach(() => jest.useRealTimers());

test('has exactly one expansion control; selection stays inline and survives opening/closing the map', () => {
  const screen = render(<CityMapSection {...base} />);
  expect(screen.getAllByLabelText('הגדלת מפת העיר')).toHaveLength(1);
  fireEvent(screen.getByTestId('canvas'), 'ready');
  fireEvent(screen.getByTestId('canvas'), 'select', 'one');
  expect(screen.getByText('מסעדת חוף')).toBeTruthy();
  expect(base.navigation.navigate).not.toHaveBeenCalled();
  expect(screen.getByTestId('selected-actions').props.item.id).toBe('one');
  fireEvent.press(screen.getByLabelText('הגדלת מפת העיר'));
  expect(screen.queryByLabelText('הגדלת מפת העיר')).toBeNull();
  expect(screen.getByTestId('canvas').props.interactive).toBe(true);
  const closeMap = screen.getByRole('button', { name: 'סגירת המפה המוגדלת' });
  expect(within(closeMap).getByText('close')).toBeTruthy();
  fireEvent.press(closeMap);
  expect(screen.getAllByLabelText('הגדלת מפת העיר')).toHaveLength(1);
  expect(screen.getByText('מסעדת חוף')).toBeTruthy();
  expect(base.navigation.navigate).not.toHaveBeenCalled();
});

test('a tile timeout can be retried independently of the recommendation query', () => {
  const screen = render(<CityMapSection {...base} />);
  act(() => jest.advanceTimersByTime(12001));
  expect(screen.getByText('המפה לא נטענה כרגע')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('ניסיון נוסף לטעינת המפה'));
  expect(screen.getByText('טוענים את המפה…')).toBeTruthy();
  fireEvent(screen.getByTestId('canvas'), 'ready');
  expect(screen.queryByText('טוענים את המפה…')).toBeNull();
});

test('a recommendation error keeps the map visible and offers its own retry', () => {
  const retry = jest.fn(); mockDiscovery.mockReturnValue({ items: [], loading: false, error: 'offline', retry });
  const screen = render(<CityMapSection {...base} />);
  fireEvent(screen.getByTestId('canvas'), 'ready');
  expect(screen.getByTestId('canvas')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('ניסיון נוסף לטעינת ההמלצות במפה'));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('searching the moved map retains the searched region when returning inline', () => {
  const screen = render(<CityMapSection {...base} />);
  fireEvent.press(screen.getByLabelText('הגדלת מפת העיר'));
  const moved = { latitude: 6.85, longitude: 81.82, latitudeDelta: 0.03, longitudeDelta: 0.03 };
  fireEvent(screen.getByTestId('canvas'), 'regionChange', moved);
  fireEvent.press(screen.getByText('חיפוש באזור המוצג'));
  fireEvent.press(screen.getByLabelText('סגירת המפה המוגדלת'));
  expect(screen.getByTestId('canvas').props.region).toEqual(moved);
  expect(mockDiscovery.mock.calls.at(-1)[0].viewport.north).toBeCloseTo(6.865);
});

test('map summaries cannot enable actions before their active canonical content resolves', () => {
  mockSelected.mockReturnValue({ data: null, loading: true, resolved: false });
  const screen = render(<CityMapSection {...base} />);
  fireEvent(screen.getByTestId('canvas'), 'select', 'one');
  expect(screen.queryByTestId('selected-actions')).toBeNull();
  mockSelected.mockReturnValue({ data: { ...item, ownerId: 'blocked' }, loading: false, resolved: true });
  screen.rerender(<CityMapSection {...base} />);
  expect(screen.queryByTestId('selected-actions')).toBeNull();
  mockSelected.mockReturnValue({ data: { ...item, status: 'deleted' }, loading: false, resolved: true });
  screen.rerender(<CityMapSection {...base} />);
  expect(screen.queryByTestId('selected-actions')).toBeNull();
  const refresh = jest.fn();
  mockSelected.mockReturnValue({ data: null, loading: false, resolved: true, error: new Error('offline'), refresh });
  screen.rerender(<CityMapSection {...base} />);
  fireEvent.press(screen.getByLabelText('ניסיון נוסף לטעינת ההמלצה שנבחרה'));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('iOS dismisses the full map before a guest auth gate and ignores repeated actions', () => {
  const previous = Platform.OS; Platform.OS = 'ios'; mockActive = false;
  try {
    const screen = render(<CityMapSection {...base} />);
    fireEvent.press(screen.getByLabelText('הגדלת מפת העיר'));
    fireEvent(screen.getByTestId('canvas'), 'select', 'one');
    const guard = screen.getByTestId('selected-actions').props.onBeforeProtectedAction;
    act(() => { expect(guard()).toBe(false); expect(guard()).toBe(false); });
    expect(mockEnsure).not.toHaveBeenCalled();
    fireEvent(screen.UNSAFE_getByType(require('react-native').Modal), 'dismiss');
    expect(mockEnsure).toHaveBeenCalledTimes(1);
    fireEvent(screen.UNSAFE_getByType(require('react-native').Modal), 'dismiss');
    expect(mockEnsure).toHaveBeenCalledTimes(1);
  } finally { Platform.OS = previous; }
});

test('all catalog categories preserve search and unrelated filters', () => {
  const filters = { query: 'beach', categoryIds: ['food'], subcategoryIds: ['cafe'], needs: ['kosher'] };
  const screen = render(<CityMapSection {...base} filters={filters} />);
  fireEvent.press(screen.getByTestId('city-map-expand'));
  const { RECOMMENDATION_CATEGORIES } = require('../src/constants/travelTaxonomy');
  for (const category of RECOMMENDATION_CATEGORIES) {
    fireEvent.press(screen.getByTestId(`city-map-category-${category.id}`));
    expect(base.onFiltersChange).toHaveBeenLastCalledWith({ ...filters, categoryIds: [category.id], subcategoryIds: [] });
  }
  fireEvent.press(screen.getByTestId('city-map-category-all'));
  expect(base.onFiltersChange).toHaveBeenLastCalledWith({ ...filters, categoryIds: [], subcategoryIds: [] });
});
