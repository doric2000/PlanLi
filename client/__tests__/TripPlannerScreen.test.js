import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const mockGetPrivateTrip = jest.fn();
const mockLoadCachedTrip = jest.fn(async () => null);
const mockFlushQueue = jest.fn(async () => ({ applied: 0, remaining: 0 }));
const mockHasQueued = jest.fn(async () => false);
const mockQuarantineQueue = jest.fn(async () => ({ quarantined: true }));
const mockCacheTrip = jest.fn(async () => {});
const mockApply = jest.fn();
const mockQueue = jest.fn();
const mockIsOffline = jest.fn(() => false);
const mockCaptureDiagnosticException = jest.fn();
let mockFocusCallback;
let mockMapProps;
let mockDayTabsProps;
let mockMissingDragIndex = false;
let mockSafeAreaTop = 0;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const ReactModule = require('react');
    mockFocusCallback = callback;
    ReactModule.useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: mockSafeAreaTop, bottom: 0 }) }));
jest.mock('react-native-draggable-flatlist', () => {
  const ReactModule = require('react');
  const { FlatList } = require('react-native');
  return ({ renderItem, onDragEnd, activationDistance, ...props }) => ReactModule.createElement(FlatList, {
    ...props,
    renderItem: ({ item, index }) => renderItem({
      item,
      getIndex: () => mockMissingDragIndex ? undefined : index,
      drag: jest.fn(),
      isActive: false,
    }),
  });
});
jest.mock('../src/features/tripPlanner/components/TripDayTabs', () => (props) => { mockDayTabsProps = props; return null; });
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => (props) => {
  mockMapProps = props;
  return null;
});
jest.mock('../src/features/tripPlanner/components/TripShareModal', () => () => null);
jest.mock('../src/services/TripService', () => ({
  applyPrivateTripOperations: (...args) => mockApply(...args),
  cacheTrip: (...args) => mockCacheTrip(...args),
  computePrivateTripRoute: jest.fn(),
  createPrivateTrip: jest.fn(),
  flushTripOperationQueue: (...args) => mockFlushQueue(...args),
  getPrivateTrip: (...args) => mockGetPrivateTrip(...args),
  hasQueuedTripOperations: (...args) => mockHasQueued(...args),
  isCorruptTripQueueError: (error) => error?.code === 'trip/local-queue-corrupt',
  isOfflineTripError: (...args) => mockIsOffline(...args),
  loadCachedTrip: (...args) => mockLoadCachedTrip(...args),
  operationId: jest.fn(() => 'mutate:test-id'),
  quarantineTripOperationQueue: (...args) => mockQuarantineQueue(...args),
  queueTripOperations: (...args) => mockQueue(...args),
  tripErrorMessage: jest.fn(() => 'שגיאה'),
  tripErrorReason: jest.fn(() => ''),
}));
jest.mock('../src/services/ErrorReporting', () => ({
  captureDiagnosticException: (...args) => mockCaptureDiagnosticException(...args),
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
  mockMissingDragIndex = false;
  mockSafeAreaTop = 0;
  mockMapProps = null;
  mockGetPrivateTrip.mockResolvedValue(trip);
  mockApply.mockResolvedValue({ revision: 2 });
  mockQueue.mockResolvedValue({});
  mockCacheTrip.mockResolvedValue();
  mockHasQueued.mockResolvedValue(false);
  mockQuarantineQueue.mockResolvedValue({ quarantined: true });
  mockIsOffline.mockReturnValue(false);
});

test('loading an existing trip settles after one request instead of retriggering on absorbed state', async () => {
  const screen = render(<TripPlannerScreen
    navigation={{ goBack: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }}
    route={{ params: { tripId: 'trip-1' } }}
  />);
  await waitFor(() => expect(screen.getByDisplayValue('טיול יציב')).toBeTruthy(), { timeout: 5000 });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(mockGetPrivateTrip).toHaveBeenCalledTimes(1);
  expect(mockGetPrivateTrip).toHaveBeenCalledWith('trip-1');
  expect(mockFlushQueue).not.toHaveBeenCalled();
});

test('the real stop list and add actions stay visible for a trip with one stop', async () => {
  mockGetPrivateTrip.mockResolvedValue({ ...trip, stopCount: 1, days: [trip.days[0], {
    ...trip.days[1], stopCount: 1,
    stops: [{ id: 'stop-1', sourceType: 'recommendation', recommendationId: 'rec-1', title: 'תצפית הכרמל', subtitle: 'חיפה', order: 0, coordinates: { lat: 32.8, lng: 35 } }],
  }] });
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  const screen = render(<TripPlannerScreen navigation={navigation} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-stop-stop-1')).toBeTruthy());
  expect(screen.getByText('תצפית הכרמל')).toBeTruthy();
  expect(screen.getByLabelText('1, תצפית הכרמל')).toBeTruthy();
  expect(screen.queryByText('NaN')).toBeNull();
  expect(screen.getByTestId('trip-stops-list').props.containerStyle).toEqual(expect.objectContaining({ flex: 1 }));
  expect(StyleSheet.flatten(screen.getByTestId('trip-map-card').props.style).marginBottom).toBe(12);
  expect(mockMapProps.interactive).toBe(false);
  expect(screen.getByTestId('trip-add-recommendations')).toBeTruthy();
  expect(screen.getByTestId('trip-add-custom-stop')).toBeTruthy();
  fireEvent.press(screen.getByTestId('trip-add-recommendations'));
  expect(navigation.navigate).toHaveBeenCalledWith('TripDiscovery', { tripId: 'trip-1', dayId: 'day-1' });
});

test('a temporarily unavailable draggable index falls back to the stop identity', async () => {
  mockMissingDragIndex = true;
  mockGetPrivateTrip.mockResolvedValue({ ...trip, stopCount: 1, days: [trip.days[0], {
    ...trip.days[1], stopCount: 1,
    stops: [{ id: 'stop-1', sourceType: 'recommendation', title: 'מלון לירו', order: 0 }],
  }] });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByLabelText('1, מלון לירו')).toBeTruthy());
  expect(screen.queryByText('NaN')).toBeNull();
});

test('a located stop shows progress until its native map surface is ready', async () => {
  mockGetPrivateTrip.mockResolvedValue({ ...trip, stopCount: 1, days: [trip.days[0], {
    ...trip.days[1], stopCount: 1,
    stops: [{ id: 'stop-1', title: 'תצפית הכרמל', order: 0, coordinates: { lat: 32.8, lng: 35 } }],
  }] });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-map-loading')).toBeTruthy());
  expect(screen.getByLabelText('מפה במסך מלא')).toBeTruthy();
  expect(mockMapProps.interactive).toBe(false);
  act(() => mockMapProps.onReady());
  expect(screen.queryByTestId('trip-map-loading')).toBeNull();
  expect(screen.getByLabelText('מפה במסך מלא')).toBeTruthy();
});

test('adding a located stop keeps an already loaded map mounted', async () => {
  const oneStopTrip = { ...trip, stopCount: 1, days: [trip.days[0], {
    ...trip.days[1], stopCount: 1,
    stops: [{ id: 'stop-1', title: 'תצפית הכרמל', order: 0, coordinates: { lat: 32.8, lng: 35 } }],
  }] };
  mockGetPrivateTrip.mockResolvedValue(oneStopTrip);
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-map-loading')).toBeTruthy());
  act(() => mockMapProps.onReady());
  expect(screen.queryByTestId('trip-map-loading')).toBeNull();

  mockGetPrivateTrip.mockResolvedValue({ ...oneStopTrip, stopCount: 2, revision: 2, days: [trip.days[0], {
    ...oneStopTrip.days[1], stopCount: 2,
    stops: [
      ...oneStopTrip.days[1].stops,
      { id: 'stop-2', title: 'הנמל', order: 1, coordinates: { lat: 32.82, lng: 34.99 } },
    ],
  }] });
  act(() => mockFocusCallback());

  await waitFor(() => expect(screen.getByText('הנמל')).toBeTruthy());
  expect(screen.queryByTestId('trip-map-loading')).toBeNull();
  expect(mockMapProps.stops).toHaveLength(2);
});

test('a map timeout keeps the map mounted and exposes a compact retry', async () => {
  let triggerMapTimeout;
  const realSetTimeout = global.setTimeout;
  const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay === 10000) {
      triggerMapTimeout = callback;
      return 101;
    }
    return realSetTimeout(callback, delay, ...args);
  });
  try {
    mockGetPrivateTrip.mockResolvedValue({ ...trip, stopCount: 1, days: [trip.days[0], {
      ...trip.days[1], stopCount: 1,
      stops: [{ id: 'stop-1', title: 'מלון לירו', order: 0, coordinates: { lat: 40.466, lng: 19.491 } }],
    }] });
    const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('trip-map-loading')).toBeTruthy();
    expect(triggerMapTimeout).toEqual(expect.any(Function));
    act(() => mockMapProps.onStageChange('tiles_pending'));
    act(() => triggerMapTimeout());
    expect(screen.getByTestId('trip-map-error')).toBeTruthy();
    expect(screen.getByText('מלון לירו')).toBeTruthy();
    expect(screen.getByTestId('trip-map-card')).toBeTruthy();
    expect(mockCaptureDiagnosticException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Trip planner map load timed out.' }),
      expect.objectContaining({
        operation: 'trip_planner_map_load',
        code: 'map_load_timeout',
        reason: expect.stringMatching(/^google_.+_1_points_tiles_pending_inline$/),
      }),
    );
    fireEvent.press(screen.getByTestId('trip-map-retry'));
    expect(screen.queryByTestId('trip-map-error')).toBeNull();
    expect(screen.getByTestId('trip-map-loading')).toBeTruthy();
    act(() => triggerMapTimeout());
    expect(mockCaptureDiagnosticException).toHaveBeenCalledTimes(2);
  } finally {
    timeoutSpy.mockRestore();
  }
});

test.each([0, 62])('fullscreen retry stays below the header with a %s-point safe area', async (safeAreaTop) => {
  mockSafeAreaTop = safeAreaTop;
  let triggerMapTimeout;
  const realSetTimeout = global.setTimeout;
  const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay === 10000) { triggerMapTimeout = callback; return 101; }
    return realSetTimeout(callback, delay, ...args);
  });
  try {
    mockGetPrivateTrip.mockResolvedValue({ ...trip, stopCount: 1, days: [trip.days[0], {
      ...trip.days[1], stopCount: 1,
      stops: [{ id: 'one', title: 'עצירה', coordinates: { lat: 32.8, lng: 35 } }],
    }] });
    const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
    await waitFor(() => expect(screen.getByTestId('trip-map-loading')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('מפה במסך מלא'));
    const header = screen.getByTestId('trip-map-full-header');
    const fullScreen = screen.getByTestId('trip-map-full-screen');
    const headerStyle = StyleSheet.flatten(header.props.style);
    expect(headerStyle.paddingTop).toBe(Math.max(safeAreaTop, 8));
    expect(headerStyle.position).not.toBe('absolute');
    expect(fullScreen.children[0].props.testID).toBe('trip-map-full-header');
    expect(StyleSheet.flatten(screen.getByTestId('trip-map-full-card').props.style).flex).toBe(1);
    act(() => triggerMapTimeout());
    const errorStyle = StyleSheet.flatten(screen.getByTestId('trip-map-full-error').props.style);
    expect(errorStyle.top).toBe(8);
    expect(errorStyle.bottom).toBe('auto');
    fireEvent.press(screen.getByTestId('trip-map-full-retry'));
    expect(screen.queryByTestId('trip-map-full-error')).toBeNull();
    expect(screen.getByTestId('trip-map-full-loading')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('חזרה לרשימת העצירות'));
    expect(screen.queryByTestId('trip-map-full-card')).toBeNull();
    expect(screen.getByTestId('trip-map-card')).toBeTruthy();
  } finally { timeoutSpy.mockRestore(); }
});

test('changing days starts a new map and rejects the previous day readiness', async () => {
  const stop = { id: 'one', title: 'עצירה', coordinates: { lat: 32.8, lng: 35 } };
  mockGetPrivateTrip.mockResolvedValue({ ...trip, stopCount: 2, days: [trip.days[0],
    { ...trip.days[1], stops: [stop], stopCount: 1 },
    { ...trip.days[1], id: 'day-2', order: 2, stops: [{ ...stop, id: 'two' }], stopCount: 1 },
  ] });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-map-loading')).toBeTruthy());
  const oldMap = mockMapProps;
  act(() => oldMap.onReady());
  act(() => mockDayTabsProps.onSelect('day-2'));
  act(() => oldMap.onReady());
  expect(screen.getByTestId('trip-map-loading')).toBeTruthy();
  expect(mockMapProps.stops[0].id).toBe('two');
  act(() => mockMapProps.onReady());
  expect(screen.queryByTestId('trip-map-loading')).toBeNull();
});

test('opening the planner without an id returns to the library without creating a trip', async () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  render(<TripPlannerScreen navigation={navigation} route={{ params: {} }} />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('MyTrips'));
  expect(require('../src/services/TripService').createPrivateTrip).not.toHaveBeenCalled();
});

test('reorder actions work without dragging and use the visible stop order', async () => {
  const twoStops = { ...trip, stopCount: 2, days: [trip.days[0], {
    ...trip.days[1], stopCount: 2, stops: [
      { id: 'a', title: 'תחנה א', sourceType: 'recommendation', order: 0 },
      { id: 'b', title: 'תחנה ב', sourceType: 'custom', order: 1 },
    ],
  }] };
  mockGetPrivateTrip.mockResolvedValue(twoStops);
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-stop-b')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('2, תחנה ב'));
  fireEvent.press(screen.getByLabelText('למעלה'));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({
    tripId: 'trip-1', expectedRevision: 1,
    operations: [{ type: 'reorder_stops', dayId: 'day-1', stopIds: ['b', 'a'] }],
  })));
});

test('offline mutation remains visible and is explicitly marked for synchronization', async () => {
  mockIsOffline.mockReturnValue(true);
  mockApply.mockRejectedValue({ code: 'functions/unavailable' });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByDisplayValue('טיול יציב')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('הליכה'));
  await waitFor(() => expect(mockQueue).toHaveBeenCalledWith(expect.objectContaining({
    tripId: 'trip-1', expectedRevision: 1, id: 'mutate:test-id',
    operations: [{ type: 'update_day', dayId: 'day-1', travelMode: 'WALK' }],
  })));
  expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'mutate:test-id' }));
  expect(screen.getByText('שמור במכשיר · ממתין לסנכרון')).toBeTruthy();
  expect(screen.getByLabelText('ניסיון סנכרון')).toBeTruthy();
});

test('a stop-count mismatch never renders as unexplained empty space', async () => {
  mockGetPrivateTrip.mockResolvedValue({ ...trip, stopCount: 1 });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByLabelText('טעינה מחדש של עצירות הטיול')).toBeTruthy());
  expect(screen.getByText('היום הזה מחכה לעצירה הראשונה')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('טעינה מחדש של עצירות הטיול'));
  await waitFor(() => expect(mockGetPrivateTrip).toHaveBeenCalledTimes(2));
});

test('a failed first load offers retry and a path back to the trip library', async () => {
  mockGetPrivateTrip.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(trip);
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  const screen = render(<TripPlannerScreen navigation={navigation} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByText('לא הצלחנו לפתוח את הטיול')).toBeTruthy());
  expect(screen.getByText('הטיולים שלי')).toBeTruthy();
  fireEvent.press(screen.getByText('ניסיון נוסף'));
  await waitFor(() => expect(screen.getByDisplayValue('טיול יציב')).toBeTruthy());
});

test('a locally queued stop remains in the list when reopening without network', async () => {
  const cached = { ...trip, revision: 2, stopCount: 1, days: [trip.days[0], {
    ...trip.days[1], stopCount: 1, stops: [{ id: 'pending-rec-1', title: 'המלצה אופליין', recommendationId: 'rec-1', sourceType: 'recommendation', order: 0 }],
  }] };
  mockLoadCachedTrip.mockResolvedValueOnce(cached);
  mockHasQueued.mockResolvedValue(true);
  mockFlushQueue.mockResolvedValue({ applied: 0, remaining: 1 });
  mockGetPrivateTrip.mockRejectedValue(new Error('offline'));
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByTestId('trip-stop-pending-rec-1')).toBeTruthy(), { timeout: 5000 });
  expect(screen.getByText('המלצה אופליין')).toBeTruthy();
  expect(screen.getByText('שמור במכשיר · ממתין לסנכרון')).toBeTruthy();
});

test('returning from discovery replaces a mounted graph with the queued cached stop', async () => {
  const cached = { ...trip, revision: 2, stopCount: 1, days: [trip.days[0], {
    ...trip.days[1], stopCount: 1, stops: [{ id: 'stop-offline-1', title: 'נוספה מהבורר', recommendationId: 'rec-1', sourceType: 'recommendation', order: 0 }],
  }] };
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByDisplayValue('טיול יציב')).toBeTruthy());

  mockHasQueued.mockResolvedValue(true);
  mockLoadCachedTrip.mockResolvedValue(cached);
  mockFlushQueue.mockResolvedValue({ applied: 0, remaining: 1 });
  act(() => { mockFocusCallback(); });

  await waitFor(() => expect(screen.getByTestId('trip-stop-stop-offline-1')).toBeTruthy());
  expect(screen.getByText('נוספה מהבורר')).toBeTruthy();
  expect(screen.getByText('שמור במכשיר · ממתין לסנכרון')).toBeTruthy();
});

test('a successful mutation with a failed refresh exposes a working reload action', async () => {
  mockGetPrivateTrip.mockResolvedValueOnce(trip).mockRejectedValueOnce(new Error('refresh failed'));
  const refreshed = { ...trip, revision: 2, days: [trip.days[0], { ...trip.days[1], travelMode: 'WALK' }] };
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByDisplayValue('טיול יציב')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('הליכה'));
  await waitFor(() => expect(screen.getByLabelText('טעינה מחדש של הטיול')).toBeTruthy());

  mockGetPrivateTrip.mockResolvedValue(refreshed);
  fireEvent.press(screen.getByLabelText('טעינה מחדש של הטיול'));
  await waitFor(() => expect(mockGetPrivateTrip).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.queryByLabelText('טעינה מחדש של הטיול')).toBeNull());
});

test('a corrupt queue can be backed up before the server graph is restored', async () => {
  mockHasQueued.mockResolvedValue(true);
  mockLoadCachedTrip.mockResolvedValue(trip);
  mockFlushQueue.mockResolvedValue({ applied: 0, remaining: 1, corrupt: true });
  const serverTrip = { ...trip, revision: 5, title: 'גרסת השרת' };
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByText('שמירת עותק והמשך')).toBeTruthy());

  mockGetPrivateTrip.mockResolvedValue(serverTrip);
  fireEvent.press(screen.getByText('שמירת עותק והמשך'));
  await waitFor(() => expect(mockQuarantineQueue).toHaveBeenCalledWith('trip-1'));
  await waitFor(() => expect(screen.getByDisplayValue('גרסת השרת')).toBeTruthy());
});

test('a rejected online mutation restores the last confirmed graph in the cache', async () => {
  mockApply.mockRejectedValue({ details: { reason: 'RECOMMENDATION_UNAVAILABLE' } });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByDisplayValue('טיול יציב')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('הליכה'));

  await waitFor(() => expect(screen.getByText('שגיאה')).toBeTruthy());
  expect(mockCacheTrip).toHaveBeenLastCalledWith(trip);
});

test('a quarantined queue never leaves the stale local graph editable when the server is unavailable', async () => {
  mockHasQueued.mockResolvedValue(true);
  mockLoadCachedTrip.mockResolvedValue(trip);
  mockFlushQueue.mockResolvedValue({ applied: 0, remaining: 1, corrupt: true });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByText('שמירת עותק והמשך')).toBeTruthy());
  mockGetPrivateTrip.mockRejectedValue(new Error('offline'));
  fireEvent.press(screen.getByText('שמירת עותק והמשך'));

  await waitFor(() => expect(screen.getByText('לא הצלחנו לפתוח את הטיול')).toBeTruthy());
  expect(screen.queryByTestId('trip-add-recommendations')).toBeNull();
  expect(screen.getByText('העותק המקומי נשמר בבטחה, אבל לא הצלחנו לטעון את גרסת השרת. נסו שוב כשהחיבור יחזור.')).toBeTruthy();
});

test('a permanently rejected queued change offers backup and recovery instead of endless sync retries', async () => {
  mockHasQueued.mockResolvedValue(true);
  mockLoadCachedTrip.mockResolvedValue(trip);
  mockFlushQueue.mockResolvedValue({ applied: 0, remaining: 1, conflict: true });
  const screen = render(<TripPlannerScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} route={{ params: { tripId: 'trip-1' } }} />);
  await waitFor(() => expect(screen.getByText('שמירת עותק והמשך')).toBeTruthy());
  expect(screen.getByText('שינוי מקומי לא יכול להסתנכרן עם גרסת השרת. אפשר לשמור עותק שלו במכשיר ולהמשיך מהגרסה העדכנית.')).toBeTruthy();
});
