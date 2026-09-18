import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import MediaGalleryModal from '../src/components/MediaGalleryModal';
import RtlPagedFlatList from '../src/components/RtlPagedFlatList';

const mockScrollToIndex = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: require('react-native').View,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../src/components/CachedImage', () => 'CachedImage');
jest.mock('../src/components/RtlPagedFlatList', () => {
  const ReactModule = require('react');
  return ReactModule.forwardRef((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex }));
    return ReactModule.createElement(require('react-native').View, { testID: 'gallery-list' },
      props.data.map((item, index) => ReactModule.createElement(ReactModule.Fragment, { key: item.id }, props.renderItem({ item, index }))));
  });
});

const items = Array.from({ length: 5 }, (_, index) => ({ id: String(index), url: `https://example.test/${index}.jpg`, caption: `Photo ${index}` }));
const measure = (screen, width, height) => fireEvent(screen.getByTestId('media-gallery-viewport'), 'layout', {
  nativeEvent: { layout: { width, height, x: 0, y: 0 } },
});

beforeEach(() => { jest.useFakeTimers(); mockScrollToIndex.mockClear(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('keeps the close control in the modal safe area and supports closing before image layout', () => {
  const onClose = jest.fn();
  const screen = render(<MediaGalleryModal visible items={items} onClose={onClose} />);
  expect(screen.UNSAFE_getByType(Modal).findByType(SafeAreaProvider).findByType(SafeAreaView)).toBeTruthy();
  const close = screen.getByRole('button', { name: 'סגירת גלריה' });
  expect(StyleSheet.flatten(close.props.style)).toEqual(expect.objectContaining({ width: 44, height: 44 }));
  fireEvent.press(close);
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('fits pages to the measured safe content area and preserves the active photo on resize', () => {
  const screen = render(<MediaGalleryModal visible items={items} initialIndex={2} onClose={jest.fn()} />);
  measure(screen, 393, 697);
  act(() => jest.runOnlyPendingTimers());
  expect(mockScrollToIndex).toHaveBeenLastCalledWith({ index: 2, animated: false });
  let list = screen.UNSAFE_getByType(RtlPagedFlatList);
  expect(list.props.getItemLayout(null, 2)).toEqual({ length: 393, offset: 786, index: 2 });
  expect(screen.UNSAFE_getAllByType('CachedImage')).toHaveLength(3);
  expect(StyleSheet.flatten(list.props.renderItem({ item: items[2], index: 2 }).props.style)).toEqual(expect.objectContaining({ width: 393, height: 697 }));
  act(() => list.props.onViewableItemsChanged({ viewableItems: [{ index: 3 }] }));
  measure(screen, 720, 220);
  act(() => jest.runOnlyPendingTimers());
  list = screen.UNSAFE_getByType(RtlPagedFlatList);
  expect(StyleSheet.flatten(list.props.renderItem({ item: items[3], index: 3 }).props.style)).toEqual(expect.objectContaining({ width: 720, height: 220 }));
  expect(mockScrollToIndex).toHaveBeenLastCalledWith({ index: 3, animated: false });
  expect(screen.getByText('4 / 5')).toBeTruthy();
  screen.rerender(<MediaGalleryModal visible={false} items={items} initialIndex={1} onClose={jest.fn()} />);
  screen.rerender(<MediaGalleryModal visible items={items} initialIndex={1} onClose={jest.fn()} />);
  act(() => jest.runOnlyPendingTimers());
  expect(mockScrollToIndex).toHaveBeenLastCalledWith({ index: 1, animated: false });
  expect(screen.getByText('2 / 5')).toBeTruthy();
});
