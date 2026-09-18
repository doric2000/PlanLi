import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockList = jest.fn();
const mockCreate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => { const ReactModule = require('react'); ReactModule.useEffect(callback, [callback]); } }));
jest.mock('../src/services/TripService', () => ({
  createPrivateTrip: (...args) => mockCreate(...args),
  deletePrivateTrip: jest.fn(),
  isOfflineTripError: jest.fn(() => false),
  listMyTrips: (...args) => mockList(...args),
  tripErrorMessage: jest.fn(() => 'לא הצלחנו לטעון את הטיולים.'),
}));

const MyTripsScreen = require('../src/features/tripPlanner/screens/MyTripsScreen').default;

beforeEach(() => { jest.clearAllMocks(); mockList.mockResolvedValue({ items: [{ id: 'trip-1', title: 'סוף שבוע בחיפה', dayCount: 2, stopCount: 3 }] }); mockCreate.mockResolvedValue({ tripId: 'trip-2' }); });

test('existing trips and resume are immediately reachable without creating another trip', async () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const screen = render(<MyTripsScreen navigation={navigation} />);
  await waitFor(() => expect(screen.getByTestId('my-trips-resume')).toBeTruthy());
  expect(screen.getByTestId('my-trip-trip-1')).toBeTruthy();
  expect(mockCreate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('my-trips-resume'));
  expect(navigation.navigate).toHaveBeenCalledWith('TripPlanner', { tripId: 'trip-1' });
});

test('load error has an explicit retry and create is user initiated', async () => {
  mockList.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ items: [] });
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const screen = render(<MyTripsScreen navigation={navigation} />);
  await waitFor(() => expect(screen.getByText('ניסיון נוסף')).toBeTruthy());
  fireEvent.press(screen.getByText('ניסיון נוסף'));
  await waitFor(() => expect(screen.getByText('יצירת הטיול הראשון')).toBeTruthy());
  fireEvent.press(screen.getByText('יצירת הטיול הראשון'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('TripPlanner', { tripId: 'trip-2' }));
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
