import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SortMenuModal } from '../src/features/community/components/SortMenuModal';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

it('keeps personalized sort gated and nearby restricted to recommendations', () => {
  const screen = render(<SortMenuModal visible sortBy="popularity" includeNearby={false} />);
  expect(screen.queryByTestId('community-sort-personalized')).toBeNull();
  expect(screen.queryByTestId('community-sort-nearby')).toBeNull();
  expect(screen.getByText('מסלולים שמטיילים אהבו')).toBeTruthy();
  screen.rerender(<SortMenuModal visible sortBy="personalized" personalizationAvailable />);
  expect(screen.getByTestId('community-sort-personalized').props.accessibilityState.checked).toBe(true);
  expect(screen.getByTestId('community-sort-nearby')).toBeTruthy();
});

it('sends the existing sort key and preserves the current choice when dismissed', () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const screen = render(<SortMenuModal visible sortBy="popularity" onSelect={onSelect} onClose={onClose} />);
  fireEvent.press(screen.getByTestId('community-sort-newest'));
  expect(onSelect).toHaveBeenCalledWith('newest');
  onSelect.mockClear();
  fireEvent.press(screen.getByLabelText('סגירת מיון'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
});
