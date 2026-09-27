import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FavoriteButton from '../src/components/FavoriteButton';
const mockToggle = jest.fn();
jest.mock('../src/hooks/useFavorite', () => ({ useFavorite: () => ({ isFavorite: false, toggleFavorite: mockToggle, loading: false }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
test('a map presentation guard defers saving, while ordinary favorite buttons still work', () => {
  const guard = jest.fn(() => false);
  const screen = render(<FavoriteButton type="recommendations" id="one" onBeforeProtectedAction={guard} />);
  fireEvent.press(screen.getByLabelText('שמירה במועדפים'));
  expect(guard).toHaveBeenCalledTimes(1);
  expect(mockToggle).not.toHaveBeenCalled();
  screen.rerender(<FavoriteButton type="recommendations" id="one" />);
  fireEvent.press(screen.getByLabelText('שמירה במועדפים'));
  expect(mockToggle).toHaveBeenCalledTimes(1);
});
