import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FlatList, Linking, StyleSheet } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import TravelMediaComposer, {
  isTravelMediaSwipe,
  reorderTravelMediaItems,
  TRAVEL_MEDIA_REORDER_LONG_PRESS_MS,
  travelMediaEmbeddedPreviewWidth,
  travelMediaPagerDelta,
  travelMediaReorderNeighborTranslation,
  travelMediaReorderTargetIndex,
  travelMediaReorderTranslationBounds,
} from '../src/components/TravelMediaComposer';

jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn() }));
jest.mock('expo-media-library/legacy', () => ({
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
    const gesture = { callbacks: {}, config: {}, type };
    [
      'enabled',
      'minDistance',
      'maxPointers',
      'shouldCancelWhenOutside',
      'activateAfterLongPress',
      'activeOffsetX',
      'failOffsetY',
      'onStart',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ].forEach((name) => {
      gesture[name] = (value) => {
        if (typeof value === 'function') gesture.callbacks[name] = value;
        else gesture.config[name] = value;
        return gesture;
      };
    });
    global.__travelMediaGestures = global.__travelMediaGestures || [];
    global.__travelMediaGestures.push(gesture);
    return gesture;
  };
  return {
    GestureHandlerRootView: ({ children, ...props }) => <View {...props}>{children}</View>,
    GestureDetector: ({ children, gesture }) => ReactModule.cloneElement(children, { testGesture: gesture }),
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
    withSpring: (value) => value,
    withTiming: (value, _config, callback) => {
      callback?.(true);
      return value;
    },
  };
});
jest.mock('react-native-draggable-flatlist', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const MockDraggableFlatList = ({
    data,
    keyExtractor,
    renderItem,
    renderPlaceholder,
    onDragBegin,
    onRelease,
    onDragEnd,
    testID,
    horizontal,
    inverted,
    dragItemOverflow,
    containerStyle,
  }) => {
    const [activeIndex, setActiveIndex] = ReactModule.useState(-1);
    return (
      <View
        testID={testID}
        onDragEnd={(params) => {
          setActiveIndex(-1);
          onDragEnd?.(params);
        }}
        onRelease={(index) => {
          setActiveIndex(-1);
          onRelease?.(index);
        }}
        horizontal={horizontal}
        inverted={inverted}
        dragItemOverflow={dragItemOverflow}
        containerStyle={containerStyle}
      >
        {activeIndex >= 0 ? renderPlaceholder?.({ item: data[activeIndex], index: activeIndex }) : null}
        {data.map((item, index) => (
          <ReactModule.Fragment key={keyExtractor(item, index)}>
            {renderItem({
              item,
              getIndex: () => index,
              drag: () => {
                setActiveIndex(index);
                onDragBegin?.(index);
              },
              isActive: activeIndex === index,
            })}
          </ReactModule.Fragment>
        ))}
      </View>
    );
  };
  return {
    __esModule: true,
    default: MockDraggableFlatList,
    ScaleDecorator: ({ children }) => <>{children}</>,
    ShadowDecorator: ({ children }) => <>{children}</>,
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
  jest.clearAllMocks();
  global.__travelMediaGestures = [];
});

const latestGesture = (type) => global.__travelMediaGestures.filter((gesture) => gesture.type === type).at(-1);

test('embedded TravelMediaComposer opens the system gallery in one tap and updates inline', async () => {
  const onChange = jest.fn();
  const screen = render(
    <TravelMediaComposer
      embedded
      visible
      value={[]}
      maxItems={5}
      aspect={[1, 1]}
      onChange={onChange}
      sourceAdapter={sourceAdapter}
    />
  );

  fireEvent.press(screen.getByTestId('travel-media-embedded-add'));

  await waitFor(() => expect(sourceAdapter.pickMore).toHaveBeenCalledWith(5));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ sourceId: 'picker-1' }),
  ]));
  expect(screen.getByTestId('travel-media-toggle-crop')).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('travel-media-reorder-list').props.style).flexDirection)
    .toBe('row-reverse');
  expect(screen.getByTestId('travel-media-drag-surface-picker-1')).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('travel-media-toggle-crop').props.style).minHeight).toBe(44);
});

test('embedded TravelMediaComposer visibly selects a held photo and reports the full reorder interaction', () => {
  const onChange = jest.fn();
  const onReorderInteractionChange = jest.fn();
  const values = [1, 2, 3].map((index) => ({
    id: `order-${index}`,
    sourceId: `order-${index}`,
    uri: `file:///order-${index}.jpg`,
    previewUri: `file:///order-${index}.jpg`,
    width: 1200,
    height: 900,
    persistence: 'ready',
  }));
  const screen = render(
    <TravelMediaComposer
      embedded
      visible
      value={values}
      maxItems={5}
      aspect={[1, 1]}
      onChange={onChange}
      onReorderInteractionChange={onReorderInteractionChange}
      sourceAdapter={sourceAdapter}
    />
  );

  act(() => {
    fireEvent(screen.getByTestId('travel-media-drag-surface-order-1'), 'layout', {
      nativeEvent: { layout: { x: 112, width: 76, height: 76 } },
    });
    fireEvent(screen.getByTestId('travel-media-drag-surface-order-2'), 'layout', {
      nativeEvent: { layout: { x: 56, width: 76, height: 76 } },
    });
    fireEvent(screen.getByTestId('travel-media-drag-surface-order-3'), 'layout', {
      nativeEvent: { layout: { x: 0, width: 76, height: 76 } },
    });
  });
  const dragSurface = screen.getByTestId('travel-media-drag-surface-order-2');
  const dragGesture = dragSurface.props.testGesture;
  act(() => dragGesture.callbacks.onStart());
  expect(onReorderInteractionChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByTestId('travel-media-drag-surface-order-2').props.testGesture).toBe(dragGesture);
  expect(screen.getByTestId('travel-media-selected-order-2').props.accessibilityState.selected).toBe(true);
  expect(StyleSheet.flatten(screen.getByTestId('travel-media-selected-order-2').props.style).borderWidth).toBe(4);
  expect(dragGesture.config.activateAfterLongPress).toBe(TRAVEL_MEDIA_REORDER_LONG_PRESS_MS);

  act(() => {
    dragGesture.callbacks.onUpdate({ translationX: -60 });
    dragGesture.callbacks.onEnd();
    dragGesture.callbacks.onFinalize();
  });

  expect(onReorderInteractionChange).toHaveBeenLastCalledWith(false);
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ sourceId: 'order-1' }),
    expect.objectContaining({ sourceId: 'order-3' }),
    expect.objectContaining({ sourceId: 'order-2' }),
  ]);
});

test('embedded TravelMediaComposer releases the outer scroll lock when a reorder is cancelled or unmounted', () => {
  const onReorderInteractionChange = jest.fn();
  const values = [1, 2].map((index) => ({
    id: `cancel-${index}`,
    sourceId: `cancel-${index}`,
    uri: `file:///cancel-${index}.jpg`,
    previewUri: `file:///cancel-${index}.jpg`,
    width: 1200,
    height: 900,
    persistence: 'ready',
  }));
  const screen = render(
    <TravelMediaComposer
      embedded
      visible
      value={values}
      maxItems={5}
      aspect={[1, 1]}
      onChange={jest.fn()}
      onReorderInteractionChange={onReorderInteractionChange}
      sourceAdapter={sourceAdapter}
    />
  );

  const firstGesture = screen.getByTestId('travel-media-drag-surface-cancel-1').props.testGesture;
  act(() => firstGesture.callbacks.onStart());
  expect(onReorderInteractionChange).toHaveBeenLastCalledWith(true);

  act(() => firstGesture.callbacks.onFinalize());
  expect(onReorderInteractionChange).toHaveBeenLastCalledWith(false);

  const secondGesture = screen.getByTestId('travel-media-drag-surface-cancel-2').props.testGesture;
  act(() => secondGesture.callbacks.onStart());
  expect(onReorderInteractionChange).toHaveBeenLastCalledWith(true);
  screen.unmount();
  expect(onReorderInteractionChange).toHaveBeenLastCalledWith(false);
});

test('embedded TravelMediaComposer maps an RTL finger drag to a bounded reorder', () => {
  expect(travelMediaReorderTargetIndex({
    fromIndex: 1,
    translationX: -60,
    itemCenters: [200, 140, 80, 20],
  })).toBe(2);
  expect(travelMediaReorderTargetIndex({
    fromIndex: 1,
    translationX: 500,
    itemCenters: [200, 140, 80, 20],
  })).toBe(0);
  expect(travelMediaReorderTranslationBounds({
    fromIndex: 1,
    itemCenters: [200, 140, 80, 20],
  })).toEqual({ minimum: -120, maximum: 60 });
  expect(travelMediaReorderNeighborTranslation({
    index: 2,
    activeIndex: 1,
    targetIndex: 3,
    itemCenters: [200, 140, 80, 20],
  })).toBe(60);
  expect(travelMediaReorderNeighborTranslation({
    index: 0,
    activeIndex: 1,
    targetIndex: 0,
    itemCenters: [200, 140, 80, 20],
  })).toBe(-60);
  expect(reorderTravelMediaItems(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b']);
});

test('embedded TravelMediaComposer keeps photo pixels and numeric badges unmirrored', () => {
  const values = [1, 2].map((index) => ({
    id: `unmirrored-${index}`,
    sourceId: `unmirrored-${index}`,
    uri: `file:///unmirrored-${index}.jpg`,
    previewUri: `file:///unmirrored-${index}.jpg`,
    width: 1200,
    height: 900,
    persistence: 'ready',
  }));
  const screen = render(
    <TravelMediaComposer
      embedded
      visible
      value={values}
      maxItems={5}
      aspect={[1, 1]}
      onChange={jest.fn()}
      sourceAdapter={sourceAdapter}
    />
  );

  const trackStyle = StyleSheet.flatten(screen.getByTestId('travel-media-reorder-list').props.style);
  const firstBadgeStyle = StyleSheet.flatten(screen.getByTestId('travel-media-selection-badge-1').props.style);
  const counterStyle = StyleSheet.flatten(screen.getByTestId('travel-media-active-counter').props.style);
  const firstPageStyle = StyleSheet.flatten(screen.getByTestId('travel-media-pager-page-unmirrored-1').props.style);
  const secondPageStyle = StyleSheet.flatten(screen.getByTestId('travel-media-pager-page-unmirrored-2').props.style);
  const previewStyle = StyleSheet.flatten(screen.getByTestId('travel-media-embedded-preview').props.style);

  expect(trackStyle.flexDirection).toBe('row-reverse');
  expect(trackStyle.direction).toBeUndefined();
  expect(screen.getByTestId('travel-media-reorder-list').props.inverted).toBeUndefined();
  expect(firstBadgeStyle).toEqual(expect.objectContaining({
    direction: 'ltr',
    writingDirection: 'ltr',
    textAlign: 'center',
  }));
  expect(counterStyle).toEqual(expect.objectContaining({
    direction: 'ltr',
    writingDirection: 'ltr',
    textAlign: 'center',
  }));
  expect(JSON.stringify(firstPageStyle.transform)).not.toContain('scaleX');
  expect(secondPageStyle.transform[0].translateX).toBeLessThan(0);
  expect(previewStyle.height).toBe(previewStyle.width);
  expect(previewStyle.maxHeight).toBe(previewStyle.width);
  expect(JSON.stringify(screen.getByTestId('travel-media-selected-unmirrored-1').props.style))
    .not.toContain('scaleX');
});

test('embedded TravelMediaComposer uses a full-width physical pager with right swipe advancing', () => {
  expect(travelMediaEmbeddedPreviewWidth(390)).toBe(390);
  expect(travelMediaEmbeddedPreviewWidth(1024)).toBe(760);
  expect(travelMediaPagerDelta({
    translationX: 80,
    translationY: 8,
    velocityX: 200,
    pageWidth: 390,
  })).toBe(1);
  expect(travelMediaPagerDelta({
    translationX: -80,
    translationY: 8,
    velocityX: -200,
    pageWidth: 390,
  })).toBe(-1);
  expect(travelMediaPagerDelta({
    translationX: 20,
    translationY: 4,
    velocityX: 100,
    pageWidth: 390,
  })).toBe(0);
});

test('embedded TravelMediaComposer advances right, returns left, and rejects a partial pager swipe', () => {
  const values = [1, 2, 3].map((index) => ({
    id: `pager-${index}`,
    sourceId: `pager-${index}`,
    uri: `file:///pager-${index}.jpg`,
    previewUri: `file:///pager-${index}.jpg`,
    width: 1200,
    height: 900,
    persistence: 'ready',
  }));
  const screen = render(
    <TravelMediaComposer
      embedded
      visible
      value={values}
      maxItems={5}
      aspect={[1, 1]}
      onChange={jest.fn()}
      sourceAdapter={sourceAdapter}
    />
  );

  let pagerGesture = screen.getByTestId('travel-media-pager').props.testGesture;
  act(() => {
    pagerGesture.callbacks.onUpdate({ translationX: 180 });
    pagerGesture.callbacks.onEnd({ translationX: 180, translationY: 5, velocityX: 250 });
    pagerGesture.callbacks.onFinalize({}, true);
  });
  expect(screen.getByTestId('travel-media-active-counter')).toHaveTextContent('2/3');

  pagerGesture = screen.getByTestId('travel-media-pager').props.testGesture;
  act(() => {
    pagerGesture.callbacks.onUpdate({ translationX: -180 });
    pagerGesture.callbacks.onEnd({ translationX: -180, translationY: 5, velocityX: -250 });
    pagerGesture.callbacks.onFinalize({}, true);
  });
  expect(screen.getByTestId('travel-media-active-counter')).toHaveTextContent('1/3');

  pagerGesture = screen.getByTestId('travel-media-pager').props.testGesture;
  act(() => {
    pagerGesture.callbacks.onUpdate({ translationX: 20 });
    pagerGesture.callbacks.onEnd({ translationX: 20, translationY: 4, velocityX: 100 });
    pagerGesture.callbacks.onFinalize({}, true);
  });
  expect(screen.getByTestId('travel-media-active-counter')).toHaveTextContent('1/3');
});

test('embedded TravelMediaComposer reserves horizontal movement for crop while crop mode is active', () => {
  const values = [1, 2].map((index) => ({
    id: `crop-pager-${index}`,
    sourceId: `crop-pager-${index}`,
    uri: `file:///crop-pager-${index}.jpg`,
    previewUri: `file:///crop-pager-${index}.jpg`,
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
      embedded
      visible
      value={values}
      maxItems={5}
      aspect={[1, 1]}
      onChange={jest.fn()}
      sourceAdapter={sourceAdapter}
    />
  );

  fireEvent.press(screen.getByTestId('travel-media-toggle-crop'));
  expect(screen.queryByTestId('travel-media-pager')).toBeNull();
  expect(screen.getByText(/מעבר לתמונה אחרת דרך התמונות הממוזערות/)).toBeTruthy();

  const cropPan = latestGesture('pan');
  act(() => {
    cropPan.callbacks.onStart({});
    cropPan.callbacks.onUpdate({ translationX: 80, translationY: 0 });
    cropPan.callbacks.onEnd({ translationX: 80, translationY: 0, velocityX: 900 });
  });
  expect(screen.getByTestId('travel-media-active-counter')).toHaveTextContent('1/2');
});

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
