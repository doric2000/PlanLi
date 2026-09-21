import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

const mockCapture = jest.fn();
const mockMapInstances = new Map();
jest.mock('../src/services/ErrorReporting', () => ({ captureDiagnosticException: (...args) => mockCapture(...args) }));
jest.mock('../src/features/tripPlanner/components/TripPlannerMap', () => (props) => {
  mockMapInstances.set(`${props.surface}-${props.attempt}`, props);
  return null;
});
const TripPlannerMapCard = require('../src/features/tripPlanner/components/TripPlannerMapCard').default;
const stops = [{ id: 'one', title: 'עצירה', coordinates: { lat: 32.8, lng: 35 } }];
let appStateChanged;
let removeListener;
beforeEach(() => {
  jest.useFakeTimers();
  mockCapture.mockClear();
  mockMapInstances.clear();
  removeListener = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    appStateChanged = listener;
    return { remove: removeListener };
  });
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('inline and full-screen attempts cannot complete each other', () => {
  const screen = render(<>
    <TripPlannerMapCard stops={stops} />
    <TripPlannerMapCard stops={stops} expanded />
  </>);
  act(() => mockMapInstances.get('inline-0').onReady());
  expect(screen.queryByTestId('trip-map-loading')).toBeNull();
  expect(screen.getByTestId('trip-map-full-loading')).toBeTruthy();
  act(() => jest.advanceTimersByTime(10000));
  expect(screen.getByTestId('trip-map-full-error')).toBeTruthy();
  expect(screen.queryByTestId('trip-map-error')).toBeNull();
  act(() => mockMapInstances.get('full-0').onReady());
  expect(screen.queryByTestId('trip-map-full-error')).toBeNull();
});

test('retry creates a fresh attempt and ignores old callbacks', () => {
  const screen = render(<TripPlannerMapCard stops={stops} />);
  const old = mockMapInstances.get('inline-0');
  act(() => { old.onStageChange('tiles_pending'); jest.advanceTimersByTime(10000); });
  expect(screen.getByTestId('trip-map-error')).toBeTruthy();
  fireEvent.press(screen.getByTestId('trip-map-retry'));
  expect(mockMapInstances.get('inline-1')).toBeTruthy();
  act(() => { old.onReady(); old.onStageChange('tiles_loaded'); });
  expect(screen.getByTestId('trip-map-loading')).toBeTruthy();
  act(() => jest.advanceTimersByTime(10000));
  expect(mockCapture).toHaveBeenCalledTimes(2);
  expect(mockCapture.mock.calls[1][1].reason).toContain('layout_pending');
  act(() => mockMapInstances.get('inline-1').onReady());
  expect(screen.queryByTestId('trip-map-error')).toBeNull();
});

test('inactive cards and background apps do not generate false timeouts', () => {
  const screen = render(<TripPlannerMapCard stops={stops} active={false} />);
  act(() => jest.advanceTimersByTime(20000));
  expect(mockCapture).not.toHaveBeenCalled();
  screen.rerender(<TripPlannerMapCard stops={stops} active />);
  act(() => jest.advanceTimersByTime(5000));
  act(() => appStateChanged('background'));
  act(() => jest.advanceTimersByTime(20000));
  expect(mockCapture).not.toHaveBeenCalled();
  act(() => appStateChanged('active'));
  act(() => jest.advanceTimersByTime(9999));
  expect(mockCapture).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(mockCapture).toHaveBeenCalledTimes(1);
});

test('closing full screen leaves the inline loading state unchanged', () => {
  const renderCards = (expanded) => <>
    <TripPlannerMapCard stops={stops} active={!expanded} />
    {expanded ? <TripPlannerMapCard stops={stops} expanded /> : null}
  </>;
  const screen = render(renderCards(true));
  const full = mockMapInstances.get('full-0');
  act(() => full.onReady());
  screen.rerender(renderCards(false));
  act(() => full.onReady());
  expect(screen.getByTestId('trip-map-loading')).toBeTruthy();
  act(() => jest.advanceTimersByTime(10000));
  expect(screen.getByTestId('trip-map-error')).toBeTruthy();
});

test('unmount removes timers and listeners and ignores late native events', () => {
  const screen = render(<TripPlannerMapCard stops={stops} expanded />);
  const previous = mockMapInstances.get('full-0');
  screen.unmount();
  act(() => { previous.onReady(); jest.advanceTimersByTime(20000); });
  expect(mockCapture).not.toHaveBeenCalled();
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('full screen remains accessible during loading and after a timeout', () => {
  const expand = jest.fn();
  const screen = render(<TripPlannerMapCard stops={stops} onExpand={expand} />);
  fireEvent.press(screen.getByLabelText('מפה במסך מלא'));
  act(() => jest.advanceTimersByTime(10000));
  fireEvent.press(screen.getByLabelText('מפה במסך מלא'));
  expect(expand).toHaveBeenCalledTimes(2);
});

test('explains numbering gaps only after tiles load and never covers loading or retry', () => {
  const withGap = [...stops, { id: 'general', title: 'מנוחה' }];
  const screen = render(<TripPlannerMapCard stops={withGap} expanded />);
  expect(screen.queryByTestId('trip-map-hidden-notice')).toBeNull();
  act(() => jest.advanceTimersByTime(10000));
  expect(screen.getByTestId('trip-map-full-error')).toBeTruthy();
  expect(screen.queryByTestId('trip-map-hidden-notice')).toBeNull();
  act(() => mockMapInstances.get('full-0').onReady());
  expect(screen.getByText('עצירה אחת אינה מוצגת כי אין לה נקודה מדויקת.')).toBeTruthy();
  screen.rerender(<TripPlannerMapCard stops={withGap} expanded selectedStopId="one" />);
  expect(screen.queryByTestId('trip-map-hidden-notice')).toBeNull();
});
