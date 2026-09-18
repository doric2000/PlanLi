import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockApply = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../src/services/TripService', () => ({
  applyPrivateTripOperations: (...args) => mockApply(...args),
  cacheTrip: jest.fn(),
  createPrivateTrip: jest.fn(),
  getPrivateTrip: jest.fn(async () => ({ id: 'trip-1', title: 'הטיול שלי', revision: 3, ideasDayId: 'ideas', days: [
    { id: 'ideas', kind: 'ideas', title: 'רעיונות', order: 0, stops: [] },
    { id: 'day-1', kind: 'day', title: 'יום 1', order: 1, stops: [] },
  ] })),
  hasQueuedTripOperations: jest.fn(async () => false),
  loadCachedTrip: jest.fn(async () => null),
  listMyTrips: jest.fn(async () => ({ items: [{ id: 'trip-1', title: 'הטיול שלי', dayCount: 1, stopCount: 0 }] })),
  isOfflineTripError: jest.fn(() => false),
  operationId: jest.fn(() => 'add-recommendation:test-id'),
  queueTripOperations: jest.fn(),
  tripErrorMessage: jest.fn(() => 'שגיאה'),
}));

const AddToTripModal = require('../src/features/tripPlanner/components/AddToTripModal').default;

beforeEach(() => { jest.clearAllMocks(); mockApply.mockResolvedValue({ revision: 4 }); });

test('adding from a recommendation defaults to the first day and offers to view the trip', async () => {
  const onClose = jest.fn();
  const screen = render(<AddToTripModal visible recommendationId="rec-1" onClose={onClose} />);
  await waitFor(() => expect(screen.getByLabelText('בחירת הטיול שלי')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('בחירת הטיול שלי'));
  await waitFor(() => expect(screen.getByTestId('add-to-trip-confirm')).toBeTruthy());
  fireEvent.press(screen.getByTestId('add-to-trip-confirm'));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith({ tripId: 'trip-1', expectedRevision: 3,
    operations: [{ type: 'add_recommendation_stops', dayId: 'day-1', recommendationIds: ['rec-1'] }], id: 'add-recommendation:test-id' }));
  fireEvent.press(screen.getByTestId('add-to-trip-view'));
  expect(onClose).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('TripPlanner', { tripId: 'trip-1' });
});
