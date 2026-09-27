import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import RouteRecommendationPicker from '../src/features/roadtrip/components/RouteRecommendationPicker';
import { getPersonalizedRecommendations } from '../src/services/PersonalizationService';
jest.mock('../src/services/PersonalizationService', () => ({ getPersonalizedRecommendations: jest.fn() }));
jest.mock('../src/components/CachedImage', () => require('react-native').View);
jest.mock('../src/features/community/components/SingleDestinationPicker', () => {
  const { Pressable, Text } = require('react-native');
  return ({ onChange }) => <Pressable testID="choose-another-city" onPress={() => onChange({ countryId: 'IT', cityId: 'rome', name: 'רומא' })}><Text>רומא</Text></Pressable>;
});
const area = { countryId: 'HU', cityId: 'budapest', name: 'בודפשט' };
const recommendation = (id) => ({ id, title: id, destination: { countryId: 'HU', cityId: 'budapest' } });
beforeEach(() => { jest.clearAllMocks(); getPersonalizedRecommendations.mockResolvedValue({ items: [] }); });

it('requests the route area, shows bounded results and chooses once', async () => {
  getPersonalizedRecommendations.mockResolvedValue({ items: Array.from({ length: 40 }, (_, i) => recommendation(`rec-${i}`)) });
  const onSelect = jest.fn();
  const screen = render(<RouteRecommendationPicker routeDestination={area} onSelect={onSelect} onCancel={jest.fn()} />);
  await waitFor(() => expect(screen.getByTestId('route-stop-recommendation-rec-0')).toBeTruthy());
  expect(getPersonalizedRecommendations).toHaveBeenCalledWith(expect.objectContaining({ context: { countryId: 'HU', cityId: 'budapest' }, query: '', sort: 'forYou', limit: 30 }), { retryFailed: false });
  const { FlatList } = require('react-native');
  expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(30);
  fireEvent.press(screen.getByTestId('route-stop-recommendation-rec-0'));
  fireEvent.press(screen.getByTestId('route-stop-recommendation-rec-0'));
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it('debounces server search and rejects an older response after query changes', async () => {
  let resolveOld;
  getPersonalizedRecommendations.mockImplementation(({ query }) => query === 'cafe'
    ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve({ items: query ? [recommendation(query)] : [] }));
  const screen = render(<RouteRecommendationPicker routeDestination={area} onSelect={jest.fn()} onCancel={jest.fn()} />);
  fireEvent.changeText(screen.getByTestId('route-recommendations-search'), 'c');
  expect(screen.getByText('הקלידו לפחות שני תווים לחיפוש.')).toBeTruthy();
  expect(getPersonalizedRecommendations).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByTestId('route-recommendations-search'), 'cafe');
  await waitFor(() => expect(resolveOld).toBeDefined());
  fireEvent.changeText(screen.getByTestId('route-recommendations-search'), 'market');
  await waitFor(() => expect(screen.getByTestId('route-stop-recommendation-market')).toBeTruthy());
  await act(async () => resolveOld({ items: [recommendation('old')] }));
  expect(screen.queryByTestId('route-stop-recommendation-old')).toBeNull();
  expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'market', sort: 'relevance' }), { retryFailed: false });
});

it('changes destination and optional filters without mutating the route area', async () => {
  const screen = render(<RouteRecommendationPicker routeDestination={area} onSelect={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('לא נמצאו המלצות שמתאימות לחיפוש וליעד שנבחרו.')).toBeTruthy());
  fireEvent.press(screen.getByTestId('route-recommendations-filters'));
  fireEvent.press(screen.getByTestId('choose-another-city'));
  fireEvent.press(screen.getByTestId('route-recommendations-category-0'));
  fireEvent.press(screen.getByTestId('route-recommendations-budget-0'));
  fireEvent.press(screen.getByTestId('route-recommendations-apply'));
  await waitFor(() => expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(expect.objectContaining({
    context: { countryId: 'IT', cityId: 'rome' }, filters: { categoryIds: [expect.any(String)], budgetLevels: [expect.any(String)] },
  }), { retryFailed: false }));
  expect(area.cityId).toBe('budapest');
});

it('retains the selected scope on empty/error responses, retries and cancels', async () => {
  getPersonalizedRecommendations.mockRejectedValueOnce(Error('offline'));
  const onCancel = jest.fn();
  const screen = render(<RouteRecommendationPicker routeDestination={area} onSelect={jest.fn()} onCancel={onCancel} />);
  fireEvent.press(await screen.findByTestId('route-stop-recommendations-retry'));
  await waitFor(() => expect(screen.getByText('לא נמצאו המלצות שמתאימות לחיפוש וליעד שנבחרו.')).toBeTruthy());
  expect(getPersonalizedRecommendations.mock.calls.every(([request]) => request.context.cityId === 'budapest')).toBe(true);
  expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(expect.any(Object), { retryFailed: true });
  fireEvent.changeText(screen.getByTestId('route-recommendations-search'), 'market');
  await waitFor(() => expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'market' }), { retryFailed: false }));
  fireEvent.press(screen.getByTestId('route-recommendations-cancel'));
  expect(onCancel).toHaveBeenCalledTimes(1);
});


it('shows results with a list action while preserving the selected query and filters', async () => {
  const onCancel = jest.fn();
  const screen = render(<RouteRecommendationPicker routeDestination={area} onSelect={jest.fn()} onCancel={onCancel} />);
  fireEvent.changeText(screen.getByTestId('route-recommendations-search'), 'market');
  await waitFor(() => expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'market' }), { retryFailed: false }));
  fireEvent.press(screen.getByTestId('route-recommendations-filters'));
  fireEvent.press(screen.getByTestId('choose-another-city'));
  fireEvent.press(screen.getByTestId('route-recommendations-category-0'));
  const toggle = screen.getByTestId('route-recommendations-filters');
  expect(screen.getByRole('button', { name: 'הצגת תוצאות: רומא, סינון פעיל' })).toBeTruthy();
  expect(within(toggle).UNSAFE_getByType(Ionicons).props.name).toBe('list-outline');
  fireEvent.press(screen.getByText('הצגת תוצאות'));
  expect(screen.getByTestId('route-recommendations-list')).toBeTruthy();
  expect(screen.getByTestId('route-recommendations-search').props.value).toBe('market');
  await waitFor(() => expect(getPersonalizedRecommendations).toHaveBeenLastCalledWith(expect.objectContaining({
    context: { countryId: 'IT', cityId: 'rome' }, query: 'market', filters: { categoryIds: [expect.any(String)], budgetLevels: [] },
  }), { retryFailed: false }));
  expect(onCancel).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('חזרה לעצירה'));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
