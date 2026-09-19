import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockApply = jest.fn();
const mockCacheTrip = jest.fn();
const mockQueueTripOperations = jest.fn();
jest.mock('react-native-uuid', () => ({ v4: jest.fn(() => 'uuid-modal-stop') }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../src/services/TripService', () => ({
  applyPrivateTripOperations: (...args) => mockApply(...args),
  cacheTrip: (...args) => mockCacheTrip(...args),
  createPrivateTrip: jest.fn(),
  getPrivateTrip: jest.fn(async () => ({ id: 'trip-1', title: 'הטיול שלי', revision: 3, ideasDayId: 'ideas', days: [
    { id: 'ideas', kind: 'ideas', title: 'רעיונות', order: 0, stops: [] },
    { id: 'day-1', kind: 'day', title: 'יום 1', order: 1, stops: [] },
  ] })),
  hasQueuedTripOperations: jest.fn(async () => false),
  isCorruptTripQueueError: (error) => error?.code === 'trip/local-queue-corrupt',
  loadCachedTrip: jest.fn(async () => null),
  listMyTrips: jest.fn(async () => ({ items: [{ id: 'trip-1', title: 'הטיול שלי', dayCount: 1, stopCount: 0 }] })),
  isOfflineTripError: jest.fn(() => false),
  operationId: jest.fn(() => 'add-recommendation:test-id'),
  queueTripOperations: (...args) => mockQueueTripOperations(...args),
  tripErrorMessage: jest.fn(() => 'שגיאה'),
}));

const AddToTripModal = require('../src/features/tripPlanner/components/AddToTripModal').default;

beforeEach(() => {
  jest.clearAllMocks();
  mockApply.mockResolvedValue({ revision: 4 });
  mockCacheTrip.mockResolvedValue();
  mockQueueTripOperations.mockResolvedValue();
  require('../src/services/TripService').isOfflineTripError.mockReturnValue(false);
});

test('adding from a recommendation defaults to the first day and offers to view the trip', async () => {
  const onClose = jest.fn();
  const screen = render(<AddToTripModal visible recommendationId="rec-1" onClose={onClose} />);
  await waitFor(() => expect(screen.getByLabelText('בחירת הטיול שלי')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('בחירת הטיול שלי'));
  await waitFor(() => expect(screen.getByTestId('add-to-trip-confirm')).toBeTruthy());
  fireEvent.press(screen.getByTestId('add-to-trip-confirm'));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith({ tripId: 'trip-1', expectedRevision: 3,
    operations: [{ type: 'add_recommendation_stops', dayId: 'day-1', recommendationIds: ['rec-1'], clientStopIds: ['stop-uuid-modal-stop'] }], id: 'add-recommendation:test-id' }));
  fireEvent.press(screen.getByTestId('add-to-trip-view'));
  expect(onClose).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('TripPlanner', { tripId: 'trip-1' });
});

test('adding offline keeps the recommendation preview visible in the cached trip', async () => {
  const service = require('../src/services/TripService');
  service.isOfflineTripError.mockReturnValue(true);
  mockApply.mockRejectedValue({ code: 'functions/unavailable' });
  const preview = {
    id: 'rec-1', title: 'נחל צבעוני', media: [{ url: 'https://example.com/photo.jpg' }],
    place: { address: 'הגליל', coordinates: { lat: 32.9, lng: 35.3 } },
  };
  const screen = render(<AddToTripModal visible recommendationId="rec-1" recommendationPreview={preview} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('בחירת הטיול שלי')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('בחירת הטיול שלי'));
  await waitFor(() => expect(screen.getByTestId('add-to-trip-confirm')).toBeTruthy());
  fireEvent.press(screen.getByTestId('add-to-trip-confirm'));

  await waitFor(() => expect(mockCacheTrip).toHaveBeenCalledWith(expect.objectContaining({
    stopCount: 1,
    days: expect.arrayContaining([expect.objectContaining({
      id: 'day-1',
      stops: [expect.objectContaining({
        id: 'stop-uuid-modal-stop', title: 'נחל צבעוני', subtitle: 'הגליל', media: preview.media,
        coordinates: { lat: 32.9, lng: 35.3 },
      })],
    })]),
  })));
  expect(mockQueueTripOperations).toHaveBeenCalledWith(expect.objectContaining({ id: 'add-recommendation:test-id' }));
  expect(screen.getByTestId('add-to-trip-view')).toBeTruthy();
});
