import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, StyleSheet } from 'react-native';

const mockGetSharedTrip = jest.fn();
const mockCopySharedTrip = jest.fn();
let mockMapProps;
let mockFocused = true;
let mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));
jest.mock('react-native-draggable-flatlist', () => () => null);
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => (props) => { mockMapProps = props; return null; });
jest.mock('../src/services/ErrorReporting', () => ({ captureDiagnosticException: jest.fn() }));
jest.mock('../src/services/TripService', () => ({
  copySharedTrip: (...args) => mockCopySharedTrip(...args),
  getSharedTrip: (...args) => mockGetSharedTrip(...args),
  sharedTripErrorMessage: jest.requireActual('../src/services/TripService').sharedTripErrorMessage,
  tripErrorMessage: jest.fn(() => 'שגיאה'),
}));

const SharedTripScreen = require('../src/features/tripPlanner/screens/SharedTripScreen').default;
const { captureDiagnosticException } = require('../src/services/ErrorReporting');
const initialAppState = AppState.currentState;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockFocused = true;
  mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  AppState.currentState = 'active';
  mockGetSharedTrip.mockResolvedValue({ id: 'shared', title: 'מסע צפוני', shared: { owner: { displayName: 'נועה' } }, ideasDayId: 'ideas', days: [
    { id: 'ideas', title: 'רעיונות', kind: 'ideas', order: 0, stops: [] },
    { id: 'day-1', title: 'יום 1', kind: 'day', order: 1, stops: [{ id: 'stop-1', sourceType: 'recommendation', recommendationId: 'rec-1', title: 'תצפית', order: 0 }] },
  ] });
  mockCopySharedTrip.mockResolvedValue({ tripId: 'copied' });
});

afterEach(() => {
  AppState.currentState = initialAppState;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test.each([false, true])('shared map pauses its timeout on blur and restarts on focus (expanded=%s)', async (expanded) => {
  mockGetSharedTrip.mockResolvedValue({ id: 'shared', title: 'טיול', days: [{ id: 'day-1', kind: 'day', title: 'יום 1', order: 1, stops: [
    { id: 'one', title: 'תצפית', order: 0, sourceType: 'recommendation', recommendationId: 'rec-1', coordinates: { lat: 32.8, lng: 35 } },
  ] }] });
  const navigation = { goBack: jest.fn(), navigate: jest.fn(() => { mockFocused = false; }) };
  const view = () => <SharedTripScreen navigation={navigation} route={{ params: { token: 'shared-token' } }} />;
  const screen = render(view());
  await waitFor(() => expect(screen.getByTestId('trip-map-card')).toBeTruthy());
  if (expanded) fireEvent.press(screen.getByLabelText('מפה במסך מלא'));
  act(() => jest.advanceTimersByTime(5000));
  if (expanded) {
    mockFocused = false;
  } else {
    fireEvent.press(screen.getByLabelText('1, תצפית'));
    fireEvent.press(screen.getByLabelText('צפייה בהמלצה'));
    expect(navigation.navigate).toHaveBeenCalledWith('RecommendationDetail', { postId: 'rec-1' });
  }
  screen.rerender(view());
  act(() => jest.advanceTimersByTime(20000));
  expect(captureDiagnosticException).not.toHaveBeenCalled();
  expect(screen.queryByTestId('trip-map-error')).toBeNull();
  expect(screen.queryByTestId('trip-map-full-error')).toBeNull();
  mockFocused = true;
  screen.rerender(view());
  act(() => jest.advanceTimersByTime(9999));
  expect(captureDiagnosticException).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(captureDiagnosticException).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId(expanded ? 'trip-map-full-error' : 'trip-map-error')).toBeTruthy();
  expect(mockGetSharedTrip).toHaveBeenCalledTimes(1);
});

test.each([false, true])('a shared map that becomes ready while blurred stays ready on return (expanded=%s)', async (expanded) => {
  mockGetSharedTrip.mockResolvedValue({ id: 'shared', title: 'טיול', days: [{ id: 'day-1', kind: 'day', title: 'יום 1', order: 1, stops: [
    { id: 'one', title: 'תצפית', order: 0, coordinates: { lat: 32.8, lng: 35 } },
  ] }] });
  const view = () => <SharedTripScreen navigation={{ goBack: jest.fn() }} route={{ params: { token: 'shared-token' } }} />;
  const screen = render(view());
  await waitFor(() => expect(screen.getByTestId('trip-map-card')).toBeTruthy());
  if (expanded) fireEvent.press(screen.getByLabelText('מפה במסך מלא'));
  mockFocused = false;
  screen.rerender(view());
  act(() => mockMapProps.onReady());
  mockFocused = true;
  screen.rerender(view());
  act(() => jest.advanceTimersByTime(20000));
  expect(captureDiagnosticException).not.toHaveBeenCalled();
  expect(screen.queryByTestId(expanded ? 'trip-map-full-loading' : 'trip-map-loading')).toBeNull();
  expect(mockGetSharedTrip).toHaveBeenCalledTimes(1);
});

test('shared trips use the same full map, numbered details and unobstructed header as the private editor', async () => {
  mockGetSharedTrip.mockResolvedValue({ id: 'shared', title: 'טיול', days: [{ id: 'day-1', kind: 'day', title: 'יום 1', order: 1, stops: [
    { id: 'general', title: 'מנוחה', order: 0 },
    { id: 'one', title: 'תצפית', order: 1, coordinates: { lat: 32.8, lng: 35 } },
  ] }] });
  const screen = render(<SharedTripScreen navigation={{ goBack: jest.fn() }} route={{ params: { token: 'shared-token' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-map-card')).toBeTruthy());
  expect(mockMapProps.interactive).toBe(false);
  fireEvent.press(screen.getByLabelText('מפה במסך מלא'));
  expect(StyleSheet.flatten(screen.getByTestId('shared-trip-map-header').props.style).position).not.toBe('absolute');
  expect(mockMapProps.interactive).toBe(true);
  act(() => mockMapProps.onReady());
  expect(screen.getByTestId('trip-map-hidden-notice')).toBeTruthy();
  act(() => mockMapProps.onSelectStop('one'));
  expect(screen.getByText('יום 1 · עצירה 2')).toBeTruthy();
  expect(screen.queryByTestId('trip-map-hidden-notice')).toBeNull();
  act(() => mockMapProps.onMapPress());
  expect(screen.queryByTestId('map-stop-details')).toBeNull();
  act(() => mockMapProps.onSelectStop('one'));
  fireEvent.press(screen.getByLabelText('חזרה לרשימה ולפרטי העצירה'));
  expect(screen.getByLabelText('2, תצפית').props.accessibilityState.expanded).toBe(true);
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

test('read failures respect iPhone safe areas, keep retry available and do not call a valid link expired', async () => {
  mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
  mockGetSharedTrip.mockRejectedValueOnce({ code: 'functions/internal' });
  const navigation = { goBack: jest.fn() };
  const screen = render(<SharedTripScreen navigation={navigation} route={{ params: { token: 'shared-token' } }} />);
  await waitFor(() => expect(screen.getByText('לא הצלחנו להתחבר כרגע. בדקו את החיבור ונסו שוב.')).toBeTruthy());
  expect(screen.queryByText('הקישור אינו זמין יותר.')).toBeNull();
  expect(StyleSheet.flatten(screen.getByTestId('shared-trip-error-safe-area').props.style))
    .toMatchObject({ paddingTop: 59, paddingBottom: 34 });
  fireEvent.press(screen.getByText('ניסיון נוסף'));
  await waitFor(() => expect(screen.getByText('מסע צפוני')).toBeTruthy());
  expect(mockGetSharedTrip).toHaveBeenCalledTimes(2);
});

test('revoked links show the unavailable message and keep back navigation available', async () => {
  mockGetSharedTrip.mockRejectedValueOnce({ code: 'functions/not-found', details: { reason: 'SHARE_NOT_AVAILABLE' } });
  const navigation = { goBack: jest.fn() };
  const screen = render(<SharedTripScreen navigation={navigation} route={{ params: { token: 'shared-token' } }} />);
  await waitFor(() => expect(screen.getByText('הקישור אינו זמין יותר.')).toBeTruthy());
  fireEvent.press(screen.getByText('חזרה'));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
