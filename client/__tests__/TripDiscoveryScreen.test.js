import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGetTrip = jest.fn();
const mockApply = jest.fn();
const mockSearch = jest.fn();
const mockFavorites = jest.fn();
const mockDiscover = jest.fn();

jest.mock('react-native-uuid', () => ({ v4: jest.fn(() => 'uuid-trip-stop') }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => { const ReactModule = require('react'); ReactModule.useEffect(callback, [callback]); } }));
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => () => null);
jest.mock('../src/features/community/components/SingleDestinationPicker', () => () => null);
jest.mock('../src/hooks/useFavoriteRecommendationsFull', () => ({ useFavoriteRecommendationsFull: (...args) => mockFavorites(...args) }));
jest.mock('../src/services/PersonalizationService', () => ({ getPersonalizedRecommendations: (...args) => mockSearch(...args) }));
jest.mock('../src/services/TripService', () => ({
  applyPrivateTripOperations: (...args) => mockApply(...args),
  cacheTrip: jest.fn(),
  discoverTripRecommendations: (...args) => mockDiscover(...args),
  getPrivateTrip: (...args) => mockGetTrip(...args),
  hasQueuedTripOperations: jest.fn(async () => false),
  isCorruptTripQueueError: (error) => error?.code === 'trip/local-queue-corrupt',
  isOfflineTripError: jest.fn(() => false),
  loadCachedTrip: jest.fn(async () => null),
  operationId: jest.fn(() => 'add-recommendations:test-id'),
  queueTripOperations: jest.fn(),
  tripErrorMessage: jest.fn(() => 'שגיאה'),
}));

const TripDiscoveryScreen = require('../src/features/tripPlanner/screens/TripDiscoveryScreen').default;
const trip = {
  id: 'trip-1', revision: 4, ideasDayId: 'ideas', days: [
    { id: 'ideas', title: 'רעיונות', kind: 'ideas', order: 0, stops: [] },
    { id: 'day-1', title: 'יום 1', kind: 'day', order: 1, stops: [] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  require('../src/services/TripService').isOfflineTripError.mockReturnValue(false);
  mockGetTrip.mockResolvedValue(trip);
  mockApply.mockResolvedValue({ revision: 5 });
  mockDiscover.mockResolvedValue({ items: [] });
  mockSearch.mockResolvedValue({ items: [{ id: 'rec-2', title: 'מקום בחיפוש', media: [] }] });
  mockFavorites.mockReturnValue({ favorites: [{ id: 'rec-1', title: 'המלצה שמורה', media: [] }], loading: false, error: null, reload: jest.fn() });
});

test('saved recommendation opens for preview separately from selection and adds to the active day', async () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const screen = render(<TripDiscoveryScreen navigation={navigation} route={{ params: { tripId: 'trip-1', dayId: 'day-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-choice-rec-1')).toBeTruthy());
  fireEvent.press(screen.getByText('המלצה שמורה'));
  expect(navigation.navigate).toHaveBeenCalledWith('RecommendationDetail', { postId: 'rec-1' });
  expect(mockApply).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('trip-select-rec-1'));
  fireEvent.press(screen.getByTestId('trip-add-selected'));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ tripId: 'trip-1', expectedRevision: 4,
    operations: [{ type: 'add_recommendation_stops', dayId: 'day-1', recommendationIds: ['rec-1'], clientStopIds: ['stop-uuid-trip-stop'] }], id: 'add-recommendations:test-id' })));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
});

test('ideas are an explicit destination and search is available without a map', async () => {
  const screen = render(<TripDiscoveryScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1', dayId: 'day-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-target-ideas')).toBeTruthy());
  fireEvent.press(screen.getByTestId('trip-target-ideas'));
  fireEvent.press(screen.getByTestId('trip-source-search'));
  await waitFor(() => expect(screen.getByTestId('trip-choice-rec-2')).toBeTruthy());
  fireEvent.press(screen.getByTestId('trip-select-rec-2'));
  fireEvent.press(screen.getByTestId('trip-add-selected'));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({
    operations: [{ type: 'add_recommendation_stops', dayId: 'ideas', recommendationIds: ['rec-2'], clientStopIds: ['stop-uuid-trip-stop'] }],
  })));
});

test('an offline recommendation is cached as a visible stop and queued with the same operation id', async () => {
  const service = require('../src/services/TripService');
  service.isOfflineTripError.mockReturnValue(true);
  mockApply.mockRejectedValue({ code: 'functions/unavailable' });
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const screen = render(<TripDiscoveryScreen navigation={navigation} route={{ params: { tripId: 'trip-1', dayId: 'day-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-choice-rec-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('trip-select-rec-1'));
  fireEvent.press(screen.getByTestId('trip-add-selected'));
  await waitFor(() => expect(service.queueTripOperations).toHaveBeenCalledWith(expect.objectContaining({
    tripId: 'trip-1', id: 'add-recommendations:test-id',
  })));
  expect(service.cacheTrip).toHaveBeenCalledWith(expect.objectContaining({
    stopCount: 1, days: expect.arrayContaining([expect.objectContaining({
      id: 'day-1', stops: [expect.objectContaining({ recommendationId: 'rec-1', title: 'המלצה שמורה' })],
    })]),
  }));
  expect(navigation.goBack).toHaveBeenCalled();
});

test('selection uses an accessible 44 point target and canonical media variants', async () => {
  mockFavorites.mockReturnValue({
    favorites: [{ id: 'rec-photo', title: 'המלצה עם תמונה', media: [{ thumb: { url: 'https://example.com/thumb.jpg' } }] }],
    loading: false, error: null, reload: jest.fn(),
  });
  const screen = render(<TripDiscoveryScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1', dayId: 'day-1' } }} />);
  const target = await screen.findByTestId('trip-select-rec-photo');
  expect(target).toHaveStyle({ width: 44, height: 44 });
  expect(screen.getByTestId('trip-choice-image-rec-photo').props.source).toEqual([{ uri: 'https://example.com/thumb.jpg' }]);
});

test('a failed search clears prior results instead of leaving stale recommendations selectable', async () => {
  const screen = render(<TripDiscoveryScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1', dayId: 'day-1' } }} />);
  fireEvent.press(screen.getByTestId('trip-source-search'));
  await waitFor(() => expect(screen.getByTestId('trip-choice-rec-2')).toBeTruthy());

  mockSearch.mockRejectedValueOnce(new Error('search failed'));
  fireEvent.changeText(screen.getByTestId('trip-search-input'), 'museum');
  await waitFor(() => expect(screen.getByText('לא הצלחנו לטעון המלצות')).toBeTruthy(), { timeout: 3000 });
  expect(screen.queryByTestId('trip-choice-rec-2')).toBeNull();
});

test('a one-character query clears earlier search results without issuing a request', async () => {
  const screen = render(<TripDiscoveryScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1', dayId: 'day-1' } }} />);
  fireEvent.press(screen.getByTestId('trip-source-search'));
  await waitFor(() => expect(screen.getByTestId('trip-choice-rec-2')).toBeTruthy());
  const callsBeforeTyping = mockSearch.mock.calls.length;

  fireEvent.changeText(screen.getByTestId('trip-search-input'), 'א');
  await waitFor(() => expect(screen.getByText('הקלידו עוד תו לחיפוש')).toBeTruthy(), { timeout: 3000 });
  expect(screen.queryByTestId('trip-choice-rec-2')).toBeNull();
  expect(mockSearch).toHaveBeenCalledTimes(callsBeforeTyping);
});

test('a map result started for one day is discarded after the target day changes', async () => {
  let resolveMap;
  mockDiscover.mockImplementation(() => new Promise((resolve) => { resolveMap = resolve; }));
  mockGetTrip.mockResolvedValue({ ...trip, days: [trip.days[0], {
    ...trip.days[1],
    stops: [{ id: 'existing-stop', title: 'נקודת התחלה', coordinates: { lat: 32.8, lng: 35 }, order: 0 }],
  }] });
  const screen = render(<TripDiscoveryScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1', dayId: 'day-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-target-day-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('trip-source-map'));
  fireEvent.press(screen.getByText('חיפוש באזור הזה'));
  await waitFor(() => expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ dayId: 'day-1' })));

  fireEvent.press(screen.getByTestId('trip-target-ideas'));
  await act(async () => { resolveMap({ items: [{ id: 'rec-map', title: 'תוצאה מהיום הישן', media: [] }] }); });
  await waitFor(() => expect(screen.getByTestId('trip-target-ideas').props.accessibilityState.selected).toBe(true));
  expect(screen.queryByTestId('trip-choice-rec-map')).toBeNull();
});
