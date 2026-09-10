import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import RouteDayTabs from '../src/features/roadtrip/components/RouteDayTabs';
const mockScrollTo = jest.fn();
jest.mock('../src/components/RtlHorizontalScrollView', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
    return <View {...props} />;
  });
});
it('keeps the selected day visible instead of resetting to day one when content changes', () => {
  const days = [{ id: 'first' }, { id: 'second' }];
  const props = { days, activeIndex: 0, locked: false, onSelect: jest.fn(), onAdd: jest.fn() };
  const screen = render(<RouteDayTabs {...props} />);
  const rail = screen.getByTestId('route-day-tabs');
  expect(rail.props.autoScrollToStart).toBe(false);
  expect(StyleSheet.flatten(rail.props.contentContainerStyle)).toEqual(expect.objectContaining({ flexGrow: 1, flexDirection: 'row-reverse' }));
  fireEvent(rail, 'layout', { nativeEvent: { layout: { width: 320 } } });
  fireEvent(screen.getByTestId('route-day-tab-0'), 'layout', { nativeEvent: { layout: { x: 500, width: 76 } } });
  fireEvent(screen.getByTestId('route-day-tab-1'), 'layout', { nativeEvent: { layout: { x: 400, width: 76 } } });
  expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 256, animated: false });
  screen.rerender(<RouteDayTabs {...props} activeIndex={1} />);
  fireEvent(screen.getByTestId('route-day-tabs'), 'contentSizeChange', 700, 48);
  expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 156, animated: false });
  fireEvent.press(screen.getByTestId('route-add-day'));
  expect(props.onAdd).toHaveBeenCalledTimes(1);
});
