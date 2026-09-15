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
    width: 44, height: 44, left: '90%', top: '10%',
  }));
  fireEvent.press(marker);
  expect(onSelectStop).toHaveBeenCalledWith('two');
});
