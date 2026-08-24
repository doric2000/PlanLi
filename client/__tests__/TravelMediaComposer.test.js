import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import TravelMediaComposer from '../src/components/TravelMediaComposer';

jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn() }));
jest.mock('../src/components/CachedImage', () => {
  const { View } = require('react-native');
  return (props) => <View {...props} />;
});
jest.mock('react-native-gesture-handler', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const chain = () => {
    const gesture = {};
    ['enabled', 'minDistance', 'shouldCancelWhenOutside', 'onStart', 'onUpdate', 'onEnd'].forEach((name) => {
      gesture[name] = () => gesture;
    });
    return gesture;
  };
  return {
    GestureHandlerRootView: ({ children, ...props }) => <View {...props}>{children}</View>,
    GestureDetector: ({ children }) => <>{children}</>,
    Gesture: { Pan: chain, Pinch: chain, Simultaneous: (...gestures) => gestures },
  };
});
jest.mock('react-native-reanimated', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    runOnJS: (fn) => fn,
    useAnimatedStyle: (factory) => factory(),
    useSharedValue: (value) => ReactModule.useRef({ value }).current,
  };
});

const sourceAdapter = {
  kind: 'system-picker',
  assets: [],
  albums: [],
  loading: false,
  error: '',
  loadInitial: jest.fn(async () => []),
  loadMore: jest.fn(async () => []),
  pickMore: jest.fn(async () => [{
    id: 'picker-1',
    sourceId: 'picker-1',
    uri: 'file:///raw.jpg',
    previewUri: 'file:///raw.jpg',
    sourceUri: 'file:///raw.jpg',
    width: 4000,
    height: 3000,
    persistence: 'ready',
  }]),
  materialize: jest.fn(async (item) => item),
};

test('TravelMediaComposer confirms the whole selection without manipulating an image', async () => {
  const onChange = jest.fn();
  const screen = render(
    <TravelMediaComposer
      visible
      value={[]}
      maxItems={5}
      aspect={[1, 1]}
      onCancel={jest.fn()}
      onChange={onChange}
      sourceAdapter={sourceAdapter}
    />
  );
  fireEvent.press(screen.getByTestId('travel-media-pick-more'));
  await waitFor(() => expect(screen.getByText('1/5')).toBeTruthy());
  expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('travel-media-done'));
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({
      uri: 'file:///raw.jpg',
      transform: expect.objectContaining({
        crop: { originX: 500, originY: 0, width: 3000, height: 3000 },
      }),
    }),
  ]);
  expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
});

test('TravelMediaComposer keeps an unavailable iCloud photo open for retry or replacement', async () => {
  const onChange = jest.fn();
  const unavailableSource = {
    ...sourceAdapter,
    pickMore: jest.fn(async () => [{
      id: 'asset:icloud-1',
      sourceId: 'asset:icloud-1',
      assetId: 'icloud-1',
      uri: 'ph://icloud-1',
      previewUri: 'ph://icloud-1',
      width: 4000,
      height: 3000,
      persistence: 'selected',
    }]),
    materialize: jest.fn(async () => { throw new Error('iCloud unavailable'); }),
  };
  const screen = render(
    <TravelMediaComposer
      visible
      value={[]}
      maxItems={5}
      aspect={[1, 1]}
      onCancel={jest.fn()}
      onChange={onChange}
      sourceAdapter={unavailableSource}
    />
  );
  fireEvent.press(screen.getByTestId('travel-media-pick-more'));
  await waitFor(() => expect(screen.getByTestId('travel-media-error')).toBeTruthy());
  expect(screen.getByText('ניסיון נוסף')).toBeTruthy();
  fireEvent.press(screen.getByTestId('travel-media-done'));
  expect(onChange).not.toHaveBeenCalled();
  expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
});

test('TravelMediaComposer virtualizes the inline gallery and paginates at the list boundary', async () => {
  const inlineSource = {
    ...sourceAdapter,
    kind: 'inline-library',
    assets: Array.from({ length: 90 }, (_, index) => ({
      id: `asset:${index}`,
      sourceId: `asset:${index}`,
      assetId: String(index),
      uri: `ph://${index}`,
      previewUri: `ph://${index}`,
      width: 1200,
      height: 900,
      persistence: 'selected',
    })),
    loadInitial: jest.fn(async () => []),
    loadMore: jest.fn(async () => []),
  };
  const screen = render(
    <TravelMediaComposer
      visible
      value={[]}
      maxItems={5}
      aspect={[1, 1]}
      onCancel={jest.fn()}
      onChange={jest.fn()}
      sourceAdapter={inlineSource}
    />
  );
  await waitFor(() => expect(inlineSource.loadInitial).toHaveBeenCalledTimes(1));
  const grid = screen.UNSAFE_getAllByType(FlatList)
    .find((list) => list.props.testID === 'travel-media-grid');
  expect(grid).toBeTruthy();
  expect(grid.props.numColumns).toBe(3);
  expect(grid.props.initialNumToRender).toBe(18);
  expect(grid.props.maxToRenderPerBatch).toBe(18);
  expect(grid.props.windowSize).toBe(7);
  await act(async () => { await grid.props.onEndReached(); });
  expect(inlineSource.loadMore).toHaveBeenCalledTimes(1);
});
