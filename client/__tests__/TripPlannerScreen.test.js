import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

const mockGetPrivateTrip = jest.fn();
const mockLoadCachedTrip = jest.fn(async () => null);
const mockFlushQueue = jest.fn(async () => ({ applied: 0, remaining: 0 }));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const ReactModule = require('react');
    ReactModule.useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../src/features/tripPlanner/components/TripDayTabs', () => () => null);
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => () => null);
jest.mock('../src/features/tripPlanner/components/TripPlannerSheet', () => ({ children }) => children);
jest.mock('../src/features/tripPlanner/components/TripShareModal', () => () => null);
jest.mock('../src/features/tripPlanner/components/TripStopList', () => () => null);
jest.mock('../src/services/TripService', () => ({
  applyPrivateTripOperations: jest.fn(),
  cacheTrip: jest.fn(async () => {}),
  computePrivateTripRoute: jest.fn(),
  createPrivateTrip: jest.fn(),
  flushTripOperationQueue: (...args) => mockFlushQueue(...args),
  getPrivateTrip: (...args) => mockGetPrivateTrip(...args),
  isOfflineTripError: jest.fn(() => false),
  loadCachedTrip: (...args) => mockLoadCachedTrip(...args),
  queueTripOperations: jest.fn(),
  tripErrorMessage: jest.fn(() => 'שגיאה'),
  tripErrorReason: jest.fn(() => ''),
}));

const TripPlannerScreen = require('../src/features/tripPlanner/screens/TripPlannerScreen').default;

const trip = {
  id: 'trip-1',
  title: 'טיול יציב',
  dayCount: 1,
  stopCount: 0,
  revision: 1,
  ideasDayId: 'ideas',
  days: [
    { id: 'ideas', kind: 'ideas', title: 'רעיונות', order: 0, stopCount: 0, stops: [] },
    { id: 'day-1', kind: 'day', title: 'יום 1', order: 1, stopCount: 0, travelMode: 'DRIVE', stops: [] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPrivateTrip.mockResolvedValue(trip);
});

test('loading an existing trip settles after one request instead of retriggering on absorbed state', async () => {
  const screen = render(<TripPlannerScreen
    navigation={{ goBack: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }}
    route={{ params: { tripId: 'trip-1' } }}
  />);
  await waitFor(() => expect(screen.getByDisplayValue('טיול יציב')).toBeTruthy());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(mockGetPrivateTrip).toHaveBeenCalledTimes(1);
  expect(mockFlushQueue).toHaveBeenCalledTimes(1);
});
