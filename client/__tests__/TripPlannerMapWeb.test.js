import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import TripPlannerMap from '../src/features/tripPlanner/components/TripPlannerMap.web';

test('web planner map renders only precise stops and keeps every marker actionable', () => {
  const onSelectStop = jest.fn();
  const screen = render(<TripPlannerMap
    stops={[
      { id: 'one', title: 'מוזיאון', coordinates: { lat: 32, lng: 34 }, sourceType: 'recommendation' },
      { id: 'two', title: 'קפה', coordinates: { lat: 33, lng: 35 }, sourceType: 'custom' },
      { id: 'general', title: 'מנוחה', locationMode: 'general' },
    ]}
    selectedStopId="two"
    onSelectStop={onSelectStop}
  />);
  expect(screen.getByText('באתר מוצג קו תכנון · ניווט חי זמין באפליקציה')).toBeTruthy();
  expect(screen.queryByLabelText('3. מנוחה')).toBeNull();
  const marker = screen.getByLabelText('2. קפה');
  expect(marker.props.style).toEqual(expect.objectContaining({
    width: 56, height: 64, left: 'calc(100% + -28px)', top: 'calc(0% + 110px)',
  }));
  fireEvent.press(marker);
  expect(onSelectStop).toHaveBeenCalledWith('two');
});

// Resolve the component's percentage/pixel CSS against a real consumer size.
const resolvePosition = (value, size) => {
  const [, percent, pixels] = value.match(/^calc\(([-\d.e]+)% \+ ([-\d.e]+)px\)$/);
  return (Number(percent) / 100) * size + Number(pixels);
};

test.each([
  ['discovery', true, 220, 50, 14],
  ['compact preview', false, 142, 39, 11],
])('%s preserves distinct positions and keeps marker bounds inside the map', (_, interactive, height, tip, tail) => {
  const stops = [32.1, 32.05, 32].map((lat, index) => ({
    id: String(index), title: `עצירה ${index}`, coordinates: { lat, lng: 34 },
  }));
  const screen = render(<TripPlannerMap stops={stops} interactive={interactive} />);
  const positions = stops.map((stop, index) => screen.getByLabelText(`${index + 1}. ${stop.title}`).props.style);
  for (const containerHeight of [height, height * 2]) {
    const ys = positions.map(({ top }) => resolvePosition(top, containerHeight));
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[1] - ys[0]).toBeCloseTo(ys[2] - ys[1]);
    expect(ys[0] - tip).toBeGreaterThanOrEqual(0);
    expect(ys[2] + tail).toBeLessThanOrEqual(containerHeight);
  }
  expect(positions.map(({ left }) => resolvePosition(left, 320))).toEqual([160, 160, 160]);
});

test('nearby longitudes stay distinct and equal latitudes remain centered within the padded area', () => {
  const screen = render(<TripPlannerMap stops={[
    { id: 'one', title: 'אחת', coordinates: { lat: 32, lng: 34 } },
    { id: 'two', title: 'שתיים', coordinates: { lat: 32, lng: 34.0001 } },
  ]} />);
  const first = screen.getByLabelText('1. אחת').props.style;
  const second = screen.getByLabelText('2. שתיים').props.style;
  expect(resolvePosition(first.left, 320)).toBe(28);
  expect(resolvePosition(second.left, 320)).toBe(292);
  expect(resolvePosition(first.top, 220)).toBe(158);
  expect(second.top).toBe(first.top);
});

test('web numbers match the day list after a stop without coordinates and after reordering', () => {
  const first = { id: 'first', title: 'ראשונה', coordinates: { lat: 32, lng: 34 } };
  const missing = { id: 'missing', title: 'מנוחה' };
  const third = { id: 'third', title: 'שלישית', coordinates: { lat: 33, lng: 35 } };
  const select = jest.fn();
  const screen = render(<TripPlannerMap stops={[first, missing, third]} selectedStopId="third" onSelectStop={select} />);
  expect(screen.queryByTestId('route-stop-marker-2')).toBeNull();
  fireEvent.press(screen.getByLabelText('3. שלישית'));
  expect(select).toHaveBeenCalledWith('third');
  expect(screen.getByLabelText('3. שלישית').props.accessibilityState.selected).toBe(true);
  screen.rerender(<TripPlannerMap stops={[third, missing, first]} selectedStopId="third" onSelectStop={select} interactive={false} />);
  expect(screen.getByLabelText('1. שלישית').props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText('3. ראשונה')).toBeTruthy();
});
