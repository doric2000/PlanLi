import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FlatList, Linking } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import TravelMediaComposer, { isTravelMediaSwipe } from '../src/components/TravelMediaComposer';

jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({
  MediaType: { photo: 'photo' },
  SortBy: { creationTime: 'creationTime' },
  getAlbumsAsync: jest.fn(async () => []),
  getAssetInfoAsync: jest.fn(async () => null),
  getAssetsAsync: jest.fn(async () => ({ assets: [], endCursor: null, hasNextPage: false })),
  presentPermissionsPickerAsync: jest.fn(async () => undefined),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
}));
jest.mock('../src/components/CachedImage', () => {
  const { View } = require('react-native');
  return (props) => <View {...props} />;
});
jest.mock('react-native-gesture-handler', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const chain = (type) => {
    const gesture = { callbacks: {}, type };
    ['enabled', 'minDistance', 'maxPointers', 'shouldCancelWhenOutside', 'onStart', 'onUpdate', 'onEnd', 'onFinalize'].forEach((name) => {
      gesture[name] = (value) => {
        if (typeof value === 'function') gesture.callbacks[name] = value;
        return gesture;
      };
    });
    global.__travelMediaGestures = global.__travelMediaGestures || [];
    global.__travelMediaGestures.push(gesture);
    return gesture;
  };
  return {
    GestureHandlerRootView: ({ children, ...props }) => <View {...props}>{children}</View>,
    GestureDetector: ({ children }) => <>{children}</>,
    Gesture: {
      Pan: () => chain('pan'),
      Pinch: () => chain('pinch'),
      Simultaneous: (...gestures) => gestures,
    },
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

beforeEach(() => {
  global.__travelMediaGestures = [];
});

const latestGesture = (type) => global.__travelMediaGestures.filter((gesture) => gesture.type === type).at(-1);

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
  await waitFor(() => expect(screen.getByText('1 מתוך 5')).toBeTruthy());
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

test('TravelMediaComposer sends a previously denied iOS photo permission to Settings', async () => {
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  const deniedSource = {
    ...sourceAdapter,
    kind: 'inline-library',
    permission: { granted: false, canAskAgain: false, status: 'denied' },
  };
  const screen = render(
    <TravelMediaComposer
      visible
      value={[]}
      maxItems={5}
      aspect={[1, 1]}
      onCancel={jest.fn()}
      onChange={jest.fn()}
      sourceAdapter={deniedSource}
    />
  );
  expect(screen.getByTestId('travel-media-permission-panel')).toBeTruthy();
  expect(screen.getByText('פתיחת הגדרות')).toBeTruthy();
  expect(screen.queryByTestId('travel-media-grid')).toBeNull();
  fireEvent.press(screen.getByTestId('travel-media-permission-action'));
  expect(openSettings).toHaveBeenCalledTimes(1);
  openSettings.mockRestore();
});

test('TravelMediaComposer retries the iOS permission prompt when the system still allows it', async () => {
  const loadInitial = jest.fn(async () => []);
  const deniedSource = {
    ...sourceAdapter,
    kind: 'inline-library',
    permission: { granted: false, canAskAgain: true, status: 'denied' },
    loadInitial,
  };
  const screen = render(
    <TravelMediaComposer
      visible
      value={[]}
      maxItems={5}
      aspect={[1, 1]}
      onCancel={jest.fn()}
      onChange={jest.fn()}
      sourceAdapter={deniedSource}
    />
  );
  await waitFor(() => expect(loadInitial).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByTestId('travel-media-permission-action'));
  expect(loadInitial).toHaveBeenCalledTimes(2);
  expect(screen.getByText('מתן גישה לתמונות')).toBeTruthy();
});

test('TravelMediaComposer virtualizes the inline gallery and paginates at the list boundary', async () => {
  const inlineSource = {
    ...sourceAdapter,
    kind: 'inline-library',
    assets: Array.from({ length: 90 }, (_, index) => ({
      id: `asset:${index}`,
      sourceId: `asset:${index}`,
      assetId: String(index),
      uri: `ph://${index}/L0/001`,
      previewUri: `ph://${index}/L0/001`,
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
  expect(grid.props.initialNumToRender).toBe(3);
  expect(grid.props.maxToRenderPerBatch).toBe(3);
  expect(grid.props.windowSize).toBe(3);
  expect(screen.getByTestId('travel-media-thumbnail-asset:0').props).toEqual(expect.objectContaining({
    resizeMode: 'cover',
    source: { uri: 'ph://0/L0/001' },
  }));
  await act(async () => { await grid.props.onEndReached(); });
  expect(inlineSource.loadMore).toHaveBeenCalledTimes(1);
});

test('TravelMediaComposer selects numbered photos for editing and deletes only the active photo', () => {
  const onChange = jest.fn();
  const values = [1, 2, 3].map((index) => ({
    id: `picker-${index}`,
    sourceId: `picker-${index}`,
    uri: `file:///photo-${index}.jpg`,
    previewUri: `file:///photo-${index}.jpg`,
    width: 1200,
    height: 900,
    persistence: 'ready',
  }));
  const screen = render(
    <TravelMediaComposer
      visible
      value={values}
      maxItems={5}
      aspect={[1, 1]}
      onCancel={jest.fn()}
      onChange={onChange}
      sourceAdapter={sourceAdapter}
    />
  );

  fireEvent.press(screen.getByTestId('travel-media-selected-picker-2'));
  expect(screen.getByText('2/3')).toBeTruthy();
  fireEvent.press(screen.getByTestId('travel-media-delete-active'));
  expect(screen.queryByTestId('travel-media-selected-picker-2')).toBeNull();
  expect(screen.getByText('2 מתוך 5')).toBeTruthy();
  fireEvent.press(screen.getByTestId('travel-media-done'));
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ sourceId: 'picker-1' }),
    expect.objectContaining({ sourceId: 'picker-3' }),
  ]);
});

test('TravelMediaComposer reserves only fast dominant horizontal gestures for photo navigation', () => {
  expect(isTravelMediaSwipe({ translationX: -70, translationY: 10, velocityX: -700 })).toBe(true);
  expect(isTravelMediaSwipe({ translationX: 70, translationY: 10, velocityX: 300 })).toBe(false);
  expect(isTravelMediaSwipe({ translationX: 70, translationY: 65, velocityX: 700 })).toBe(false);
  expect(isTravelMediaSwipe({ translationX: 40, translationY: 4, velocityX: 900 })).toBe(false);
});

test('TravelMediaComposer navigates on a fast swipe and commits slow, pinched, and cancelled crops', async () => {
  const onChange = jest.fn();
  const values = [1, 2].map((index) => ({
    id: `gesture-${index}`,
    sourceId: `gesture-${index}`,
    uri: `file:///gesture-${index}.jpg`,
    previewUri: `file:///gesture-${index}.jpg`,
    width: 1200,
    height: 900,
    persistence: 'ready',
    transform: {
      crop: { originX: 150, originY: 0, width: 900, height: 900 },
      aspect: [1, 1],
      maxLongEdge: 1600,
      compress: 0.94,
      format: 'jpeg',
    },
  }));
  const screen = render(
    <TravelMediaComposer
      visible
      value={values}
      maxItems={5}
      aspect={[1, 1]}
      onCancel={jest.fn()}
      onChange={onChange}
      sourceAdapter={sourceAdapter}
    />
  );

  await act(async () => {
    fireEvent(screen.getByTestId('travel-media-crop-stage'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 300 } },
    });
  });
  await act(async () => {
    fireEvent(screen.getByTestId('travel-media-crop-viewport'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 300 } },
    });
  });

  let pan = latestGesture('pan');
  act(() => {
    pan.callbacks.onStart({});
    pan.callbacks.onEnd({ translationX: -70, translationY: 8, velocityX: -700 });
  });
  expect(screen.getByText('2/2')).toBeTruthy();

  await act(async () => {
    fireEvent(screen.getByTestId('travel-media-crop-stage'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 300 } },
    });
  });
  await act(async () => {
    fireEvent(screen.getByTestId('travel-media-crop-viewport'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 300 } },
    });
  });

  pan = latestGesture('pan');
  act(() => {
    pan.callbacks.onStart({});
    pan.callbacks.onUpdate({ translationX: 30, translationY: 0 });
    pan.callbacks.onFinalize({}, false);
  });
  const pinch = latestGesture('pinch');
  act(() => {
    pinch.callbacks.onStart({});
    pinch.callbacks.onUpdate({ scale: 2 });
    pinch.callbacks.onEnd({});
  });
  fireEvent.press(screen.getByTestId('travel-media-done'));

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ sourceId: 'gesture-1' }),
    expect.objectContaining({
      sourceId: 'gesture-2',
      transform: expect.objectContaining({
        crop: expect.objectContaining({ width: 450, height: 450 }),
      }),
    }),
  ]);
});
