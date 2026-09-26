import React from 'react';
import { StyleSheet } from 'react-native';
import { render, within } from '@testing-library/react-native';

import RouteStopMarker from '../src/features/roadtrip/components/RouteStopMarker';

jest.mock('../src/components/CachedImage', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return (props) => ReactModule.createElement(View, { ...props, testID: 'marker-image' });
});

test('image marker badges sit outside the clipped photo head', () => {
  const screen = render(
    <RouteStopMarker
      stop={{ id: 'stop', title: 'תחנה' }}
      displayNumber={12}
      displayDayNumber={3}
      imageUrl="https://example.com/stop.jpg"
    />
  );

  const wrapper = screen.getByTestId('route-stop-marker-head-wrap');
  const head = screen.getByTestId('route-stop-marker-head');

  expect(within(wrapper).getByTestId('route-stop-marker-head')).toBeTruthy();
  expect(within(wrapper).getByTestId('route-stop-marker-number-badge')).toBeTruthy();
  expect(within(wrapper).getByTestId('route-stop-marker-day-badge')).toBeTruthy();
  expect(within(head).queryByTestId('route-stop-marker-number-badge')).toBeNull();
  expect(within(head).queryByTestId('route-stop-marker-day-badge')).toBeNull();
  expect(StyleSheet.flatten(wrapper.props.style)).toMatchObject({ width: 42, height: 42, overflow: 'visible' });
  expect(StyleSheet.flatten(head.props.style)).toMatchObject({ width: 42, height: 42, overflow: 'hidden' });
  expect(screen.getAllByText('12')).toHaveLength(1);
});

test('compact marker keeps the same visible badge hierarchy and dimensions', () => {
  const screen = render(
    <RouteStopMarker
      compact
      stop={{ id: 'stop', title: 'תחנה' }}
      displayNumber={2}
      imageUrl="https://example.com/stop.jpg"
    />
  );

  const wrapper = screen.getByTestId('route-stop-marker-head-wrap');
  const head = screen.getByTestId('route-stop-marker-head');
  expect(within(wrapper).getByTestId('route-stop-marker-number-badge')).toBeTruthy();
  expect(within(head).queryByTestId('route-stop-marker-number-badge')).toBeNull();
  expect(StyleSheet.flatten(wrapper.props.style)).toMatchObject({ width: 32, height: 32, overflow: 'visible' });
  expect(StyleSheet.flatten(head.props.style)).toMatchObject({ width: 32, height: 32, overflow: 'hidden' });
});
