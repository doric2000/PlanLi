import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGetSharedTrip = jest.fn();
const mockCopySharedTrip = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('react-native-draggable-flatlist', () => () => null);
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => () => null);
jest.mock('../src/services/TripService', () => ({
  copySharedTrip: (...args) => mockCopySharedTrip(...args),
  getSharedTrip: (...args) => mockGetSharedTrip(...args),
  tripErrorMessage: jest.fn(() => 'שגיאה'),
}));

const SharedTripScreen = require('../src/features/tripPlanner/screens/SharedTripScreen').default;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSharedTrip.mockResolvedValue({ id: 'shared', title: 'מסע צפוני', shared: { owner: { displayName: 'נועה' } }, ideasDayId: 'ideas', days: [
    { id: 'ideas', title: 'רעיונות', kind: 'ideas', order: 0, stops: [] },
    { id: 'day-1', title: 'יום 1', kind: 'day', order: 1, stops: [{ id: 'stop-1', sourceType: 'recommendation', recommendationId: 'rec-1', title: 'תצפית', order: 0 }] },
  ] });
  mockCopySharedTrip.mockResolvedValue({ tripId: 'copied' });
});

test('a shared trip shows its real stop list and copies into the private editor', async () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  const screen = render(<SharedTripScreen navigation={navigation} route={{ params: { token: 'shared-token' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-stop-stop-1')).toBeTruthy(), { timeout: 5000 });
  expect(screen.getByText('תצפית')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('1, תצפית'));
  fireEvent.press(screen.getByLabelText('צפייה בהמלצה'));
  expect(navigation.navigate).toHaveBeenCalledWith('RecommendationDetail', { postId: 'rec-1' });
  fireEvent.press(screen.getByTestId('shared-trip-copy'));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('TripPlanner', { tripId: 'copied' }));
});
