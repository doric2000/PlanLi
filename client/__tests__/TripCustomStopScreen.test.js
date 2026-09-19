import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGetTrip = jest.fn();
const mockApply = jest.fn();
const mockCacheTrip = jest.fn();
const mockQueueTripOperations = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => () => null);
jest.mock('../src/components/ExactLocationPicker', () => () => null);
jest.mock('../src/services/TripService', () => ({
  applyPrivateTripOperations: (...args) => mockApply(...args),
  cacheTrip: (...args) => mockCacheTrip(...args),
  getPrivateTrip: (...args) => mockGetTrip(...args),
  hasQueuedTripOperations: jest.fn(async () => false),
  isCorruptTripQueueError: (error) => error?.code === 'trip/local-queue-corrupt',
  isOfflineTripError: jest.fn(() => false),
  loadCachedTrip: jest.fn(async () => null),
  operationId: jest.fn(() => 'custom-stop:test-id'),
  queueTripOperations: (...args) => mockQueueTripOperations(...args),
  tripErrorMessage: jest.fn(() => 'שגיאה'),
}));

const TripCustomStopScreen = require('../src/features/tripPlanner/screens/TripCustomStopScreen').default;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTrip.mockResolvedValue({ id: 'trip-1', revision: 3, days: [{ id: 'day-1', stops: [{
    id: 'stop-1', sourceType: 'custom', title: 'עצירה מקורית', subtitle: 'כתובת', note: 'פתוח עד הערב',
    locationMode: 'general', coordinates: null,
  }] }] });
  mockApply.mockResolvedValue({ revision: 4 });
  mockCacheTrip.mockResolvedValue();
  mockQueueTripOperations.mockResolvedValue();
  const service = require('../src/services/TripService');
  service.isOfflineTripError.mockReturnValue(false);
  service.loadCachedTrip.mockResolvedValue(null);
});

test('a failed offline queue restores the cached stop instead of showing an unsyncable edit', async () => {
  const service = require('../src/services/TripService');
  service.isOfflineTripError.mockReturnValue(true);
  mockApply.mockRejectedValue({ code: 'functions/unavailable' });
  mockQueueTripOperations.mockRejectedValue({ code: 'trip/local-queue-corrupt' });
  const original = await mockGetTrip();
  service.loadCachedTrip.mockResolvedValue(original);
  const navigation = { goBack: jest.fn() };
  const screen = render(<TripCustomStopScreen navigation={navigation} route={{ params: {
    tripId: 'trip-1', dayId: 'day-1', stopId: 'stop-1', revision: 2,
  } }} />);
  await waitFor(() => expect(screen.getByDisplayValue('עצירה מקורית')).toBeTruthy());
  fireEvent.changeText(screen.getByDisplayValue('עצירה מקורית'), 'עריכה שלא תסונכרן');
  fireEvent.press(screen.getByText('שמירת העצירה'));

  await waitFor(() => expect(screen.getByText('יש שינוי מקומי שלא ניתן לקרוא. חזרו לטיול כדי לשמור עותק שלו ולהמשיך.')).toBeTruthy());
  expect(mockCacheTrip).toHaveBeenLastCalledWith(original);
  expect(navigation.goBack).not.toHaveBeenCalled();
});

test('an existing custom stop is loaded, edited, and saved with its current revision', async () => {
  const navigation = { goBack: jest.fn() };
  const screen = render(<TripCustomStopScreen navigation={navigation} route={{ params: {
    tripId: 'trip-1', dayId: 'day-1', stopId: 'stop-1', revision: 2,
  } }} />);
  await waitFor(() => expect(screen.getByDisplayValue('עצירה מקורית')).toBeTruthy());
  fireEvent.changeText(screen.getByDisplayValue('עצירה מקורית'), 'עצירה מעודכנת');
  fireEvent.press(screen.getByText('שמירת העצירה'));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith({
    tripId: 'trip-1', expectedRevision: 3, operations: [{
      type: 'update_custom_stop', dayId: 'day-1', stopId: 'stop-1',
      stop: { title: 'עצירה מעודכנת', subtitle: 'כתובת', note: 'פתוח עד הערב', locationMode: 'general', coordinates: null },
    }], id: 'custom-stop:test-id',
  }));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
});
