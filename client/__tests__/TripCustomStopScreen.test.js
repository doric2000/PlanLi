import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGetTrip = jest.fn();
const mockApply = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => () => null);
jest.mock('../src/components/ExactLocationPicker', () => () => null);
jest.mock('../src/services/TripService', () => ({
  applyPrivateTripOperations: (...args) => mockApply(...args),
  cacheTrip: jest.fn(),
  getPrivateTrip: (...args) => mockGetTrip(...args),
  hasQueuedTripOperations: jest.fn(async () => false),
  isOfflineTripError: jest.fn(() => false),
  loadCachedTrip: jest.fn(async () => null),
  operationId: jest.fn(() => 'custom-stop:test-id'),
  queueTripOperations: jest.fn(),
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
