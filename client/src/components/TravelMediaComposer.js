import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import AppText from './AppText';
import CachedImage from './CachedImage';
import RtlHorizontalScrollView from './RtlHorizontalScrollView';
import {
  boundCropTranslation,
  calculateCropRect,
  cropRectToViewportTransform,
  fitCropViewport,
} from '../utils/cropMath';
import { getImageSize } from '../hooks/useImagePicker';
import useTravelMediaSource from '../hooks/useTravelMediaSource';
import { colors, spacing } from '../styles';
import {
  createTravelMediaDescriptor,
  mergeTravelMediaSelection,
  travelMediaIdentity,
  travelMediaUri,
  updateTravelMediaCrop,
} from '../utils/travelMedia';

const ZERO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
export const TRAVEL_MEDIA_SWIPE_DISTANCE = 48;
export const TRAVEL_MEDIA_SWIPE_VELOCITY = 500;
export const TRAVEL_MEDIA_SWIPE_DOMINANCE = 1.25;
export const TRAVEL_MEDIA_REORDER_LONG_PRESS_MS = 220;
const TRAVEL_MEDIA_REORDER_MAX_THUMB_SIZE = 76;
const TRAVEL_MEDIA_REORDER_MIN_THUMB_SIZE = 48;
const TRAVEL_MEDIA_EMBEDDED_MAX_WIDTH = 760;
const TRAVEL_MEDIA_PAGER_EDGE_RESISTANCE = 0.16;
const TRAVEL_MEDIA_PAGER_DISTANCE_RATIO = 0.18;

export function travelMediaEmbeddedPreviewWidth(windowWidth) {
  return Math.min(
    TRAVEL_MEDIA_EMBEDDED_MAX_WIDTH,
    Math.max(1, Number(windowWidth) || TRAVEL_MEDIA_EMBEDDED_MAX_WIDTH)
  );
}

export function isTravelMediaSwipe({ translationX = 0, translationY = 0, velocityX = 0 } = {}) {
  'worklet';
  const horizontalDistance = Math.abs(translationX);
  return horizontalDistance >= TRAVEL_MEDIA_SWIPE_DISTANCE
    && Math.abs(velocityX) >= TRAVEL_MEDIA_SWIPE_VELOCITY
    && horizontalDistance >= Math.abs(translationY) * TRAVEL_MEDIA_SWIPE_DOMINANCE;
}

export function travelMediaReorderTargetIndex({
  fromIndex,
  translationX = 0,
  itemCenters = [],
} = {}) {
  'worklet';
  if (
    !Number.isInteger(fromIndex) || !Number.isFinite(translationX) ||
    !Array.isArray(itemCenters) || !Number.isFinite(itemCenters[fromIndex])
  ) return fromIndex;
  const draggedCenter = itemCenters[fromIndex] + translationX;
  let closestIndex = fromIndex;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < itemCenters.length; index += 1) {
    if (!Number.isFinite(itemCenters[index])) continue;
    const distance = Math.abs(itemCenters[index] - draggedCenter);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }
  return closestIndex;
}

export function travelMediaReorderTranslationBounds({ fromIndex, itemCenters = [] } = {}) {
  'worklet';
  if (!Number.isInteger(fromIndex) || !Number.isFinite(itemCenters[fromIndex])) {
    return { minimum: 0, maximum: 0 };
  }
  const startCenter = itemCenters[fromIndex];
  let minimum = 0;
  let maximum = 0;
  for (let index = 0; index < itemCenters.length; index += 1) {
    if (!Number.isFinite(itemCenters[index])) continue;
    const translation = itemCenters[index] - startCenter;
    minimum = Math.min(minimum, translation);
    maximum = Math.max(maximum, translation);
  }
  return { minimum, maximum };
}

export function travelMediaReorderNeighborTranslation({
  index,
  activeIndex,
  targetIndex,
  itemCenters = [],
} = {}) {
  'worklet';
  if (
    !Number.isInteger(index) || !Number.isInteger(activeIndex) || !Number.isInteger(targetIndex) ||
    !Array.isArray(itemCenters)
  ) return 0;
  if (activeIndex < targetIndex && index > activeIndex && index <= targetIndex) {
    if (!Number.isFinite(itemCenters[index - 1]) || !Number.isFinite(itemCenters[index])) return 0;
    return itemCenters[index - 1] - itemCenters[index];
  }
  if (activeIndex > targetIndex && index >= targetIndex && index < activeIndex) {
    if (!Number.isFinite(itemCenters[index + 1]) || !Number.isFinite(itemCenters[index])) return 0;
    return itemCenters[index + 1] - itemCenters[index];
  }
  return 0;
}

export function travelMediaPagerDelta({
  translationX = 0,
  translationY = 0,
  velocityX = 0,
  pageWidth = 0,
} = {}) {
  'worklet';
  const width = Math.max(0, Number(pageWidth) || 0);
  const horizontalDistance = Math.abs(translationX);
  const horizontalVelocity = Math.abs(velocityX);
  const directionValue = horizontalDistance > 0 ? translationX : velocityX;
  const distanceThreshold = Math.max(
    TRAVEL_MEDIA_SWIPE_DISTANCE,
    width * TRAVEL_MEDIA_PAGER_DISTANCE_RATIO
  );
  const dominant = horizontalDistance >= Math.abs(translationY) * TRAVEL_MEDIA_SWIPE_DOMINANCE;
  if (
    !width || !directionValue || !dominant ||
    (horizontalDistance < distanceThreshold && horizontalVelocity < TRAVEL_MEDIA_SWIPE_VELOCITY)
  ) return 0;
  return directionValue > 0 ? 1 : -1;
}

export function reorderTravelMediaItems(items, fromIndex, toIndex) {
  if (
    !Array.isArray(items) || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex) ||
    fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length ||
    fromIndex === toIndex
  ) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function MediaImage({ uri, contentFit = 'cover', ...props }) {
  if (uri?.startsWith('ph://')) {
    // The Expo SDK 54 image loader drops PhotoKit's /L0/001 identifier suffix.
    // expo-media-library registers a React Native Image loader that preserves it.
    return (
      <Image
        {...props}
        source={{ uri }}
        resizeMode={contentFit === 'fill' ? 'stretch' : contentFit}
      />
    );
  }
  return <CachedImage {...props} source={{ uri }} contentFit={contentFit} />;
}

function CropPage({
  item,
  aspect,
  onCropChange,
  onSwipe,
  cropEnabled = true,
  navigationEnabled = true,
  existingContentFit = 'contain',
  showExistingHint = true,
  maxViewportWidth,
}) {
  const uri = travelMediaUri(item);
  const [sourceSize, setSourceSize] = useState(() => item.width && item.height
    ? { width: item.width, height: item.height }
    : null);
  const [stageSize, setStageSize] = useState(null);
  const [viewport, setViewport] = useState(null);
  const zoom = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const displayWidth = useSharedValue(0);
  const displayHeight = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const isAdjusting = useSharedValue(0);
  const initialCropApplied = useRef(false);
  const ratio = (Number(aspect?.[0]) || 1) / (Number(aspect?.[1]) || 1);
  const hasEditableCrop = item.type !== 'remote' && Boolean(item.transform);
  const canCrop = cropEnabled && hasEditableCrop;

  useEffect(() => {
    let active = true;
    if (sourceSize || !uri) return () => { active = false; };
    getImageSize(uri).then((size) => {
      if (active) setSourceSize(size);
    }).catch(() => {});
    return () => { active = false; };
  }, [sourceSize, uri]);

  const fittedViewport = useMemo(() => fitCropViewport({
    containerWidth: stageSize?.width,
    containerHeight: stageSize?.height,
    aspectRatio: ratio,
    maxWidth: maxViewportWidth,
  }), [maxViewportWidth, ratio, stageSize]);
  const displaySize = useMemo(() => {
    if (!sourceSize || !viewport) return null;
    const scale = Math.max(viewport.width / sourceSize.width, viewport.height / sourceSize.height);
    return { width: sourceSize.width * scale, height: sourceSize.height * scale };
  }, [sourceSize, viewport]);

  useEffect(() => {
    displayWidth.value = displaySize?.width || 0;
    displayHeight.value = displaySize?.height || 0;
    viewportWidth.value = viewport?.width || 0;
    viewportHeight.value = viewport?.height || 0;
  }, [displayHeight, displaySize, displayWidth, viewport, viewportHeight, viewportWidth]);

  useEffect(() => {
    if (initialCropApplied.current || !sourceSize || !viewport || !hasEditableCrop) return;
    const initial = cropRectToViewportTransform({
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      crop: item.transform?.crop,
    });
    zoom.value = initial.zoom;
    translateX.value = initial.translateX;
    translateY.value = initial.translateY;
    startZoom.value = initial.zoom;
    startX.value = initial.translateX;
    startY.value = initial.translateY;
    initialCropApplied.current = true;
  }, [
    hasEditableCrop, item.transform?.crop, sourceSize, startX, startY, startZoom, translateX,
    translateY, viewport, zoom,
  ]);

  const commitCrop = useCallback((nextZoom, nextX, nextY) => {
    if (!sourceSize || !viewport || !canCrop) return;
    onCropChange(calculateCropRect({
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      zoom: nextZoom,
      translateX: nextX,
      translateY: nextY,
    }));
  }, [canCrop, onCropChange, sourceSize, viewport]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(Boolean(uri) && (canCrop || navigationEnabled))
    .minDistance(1)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
      isAdjusting.value = 1;
    })
    .onUpdate((event) => {
      if (!canCrop) return;
      const bounded = boundCropTranslation({
        displayWidth: displayWidth.value,
        displayHeight: displayHeight.value,
        viewportWidth: viewportWidth.value,
        viewportHeight: viewportHeight.value,
        zoom: zoom.value,
        translateX: startX.value + event.translationX,
        translateY: startY.value + event.translationY,
      });
      translateX.value = bounded.x;
      translateY.value = bounded.y;
    })
    .onEnd((event) => {
      if (navigationEnabled && isTravelMediaSwipe(event)) {
        translateX.value = startX.value;
        translateY.value = startY.value;
        isAdjusting.value = 0;
        runOnJS(onSwipe)(event.translationX < 0 ? 1 : -1);
        return;
      }
      isAdjusting.value = 0;
      if (canCrop) runOnJS(commitCrop)(zoom.value, translateX.value, translateY.value);
    })
    .onFinalize((_event, success) => {
      isAdjusting.value = 0;
      if (!success && canCrop) {
        runOnJS(commitCrop)(zoom.value, translateX.value, translateY.value);
      }
    }), [
      canCrop, commitCrop, displayHeight, displayWidth, isAdjusting, navigationEnabled, onSwipe, startX, startY,
      translateX, translateY, uri, viewportHeight, viewportWidth, zoom,
    ]);
  const pinch = useMemo(() => Gesture.Pinch()
    .enabled(canCrop)
    .onStart(() => {
      startZoom.value = zoom.value;
      isAdjusting.value = 1;
    })
    .onUpdate((event) => {
      const nextZoom = Math.max(1, Math.min(4, startZoom.value * event.scale));
      const bounded = boundCropTranslation({
        displayWidth: displayWidth.value,
        displayHeight: displayHeight.value,
        viewportWidth: viewportWidth.value,
        viewportHeight: viewportHeight.value,
        zoom: nextZoom,
        translateX: translateX.value,
        translateY: translateY.value,
      });
      zoom.value = nextZoom;
      translateX.value = bounded.x;
      translateY.value = bounded.y;
    })
    .onEnd(() => {
      isAdjusting.value = 0;
      runOnJS(commitCrop)(zoom.value, translateX.value, translateY.value);
    })
    .onFinalize((_event, success) => {
      isAdjusting.value = 0;
      if (!success) runOnJS(commitCrop)(zoom.value, translateX.value, translateY.value);
    }), [
      canCrop, commitCrop, displayHeight, displayWidth, isAdjusting, startZoom, translateX,
      translateY, viewportHeight, viewportWidth, zoom,
    ]);
  const gesture = useMemo(() => Gesture.Simultaneous(pan, pinch), [pan, pinch]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: zoom.value },
    ],
  }));
  const cropGridStyle = useAnimatedStyle(() => ({ opacity: isAdjusting.value ? 1 : 0 }));

  if (!hasEditableCrop) {
    return (
      <GestureDetector gesture={pan}>
        <Animated.View style={styles.uncroppedPage} testID="travel-media-existing-preview">
          <MediaImage uri={uri} style={styles.uncroppedImage} contentFit={existingContentFit} />
          {showExistingHint ? (
            <AppText style={styles.existingHint}>תמונה שכבר פורסמה נשארת ללא שינוי</AppText>
          ) : null}
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <View
      style={styles.cropStage}
      onLayout={(event) => setStageSize({
        width: Math.max(0, event.nativeEvent.layout.width),
        height: Math.max(0, event.nativeEvent.layout.height),
      })}
      testID="travel-media-crop-stage"
    >
      {fittedViewport ? (
        <View
          style={[styles.cropViewport, fittedViewport]}
          onLayout={(event) => setViewport(event.nativeEvent.layout)}
          testID="travel-media-crop-viewport"
        >
          {displaySize && uri ? (
            <GestureDetector gesture={gesture}>
              <Animated.View style={styles.gestureSurface} collapsable={false}>
                <Animated.View style={[
                  styles.cropImageWrap,
                  {
                    width: displaySize.width,
                    height: displaySize.height,
                    left: (viewport.width - displaySize.width) / 2,
                    top: (viewport.height - displaySize.height) / 2,
                  },
                  animatedStyle,
                ]}>
                  <MediaImage uri={uri} style={styles.cropImage} contentFit="fill" />
                </Animated.View>
              </Animated.View>
            </GestureDetector>
          ) : <ActivityIndicator size="large" color={colors.white} />}
          <Animated.View pointerEvents="none" style={[styles.cropGrid, cropGridStyle]}>
            <View style={[styles.cropGridLine, styles.cropGridVerticalOne]} />
            <View style={[styles.cropGridLine, styles.cropGridVerticalTwo]} />
            <View style={[styles.cropGridLine, styles.cropGridHorizontalOne]} />
            <View style={[styles.cropGridLine, styles.cropGridHorizontalTwo]} />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function SelectionBadge({ number }) {
  if (!number) return null;
  return (
    <View style={styles.badge}>
      <AppText style={styles.badgeText} testID={`travel-media-selection-badge-${number}`}>
        {String(number)}
      </AppText>
    </View>
  );
}

function EmbeddedMediaPagerPage({
  item,
  pageIndex,
  activeIndex,
  pageWidth,
  dragTranslationX,
}) {
  const identity = travelMediaIdentity(item);
  const baseTranslationX = -(pageIndex - activeIndex) * pageWidth;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: baseTranslationX + dragTranslationX.value }],
  }), [baseTranslationX]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.embeddedPagerPage, animatedStyle]}
      testID={`travel-media-pager-page-${identity}`}
    >
      <MediaImage
        uri={travelMediaUri(item)}
        style={styles.embeddedPagerImage}
        contentFit="cover"
        pointerEvents="none"
        testID={`travel-media-pager-image-${identity}`}
      />
    </Animated.View>
  );
}

function EmbeddedMediaPager({ items, activeIndex, pageWidth, onNavigate }) {
  const dragTranslationX = useSharedValue(0);

  useEffect(() => {
    dragTranslationX.value = 0;
  }, [activeIndex, dragTranslationX, items.length, pageWidth]);

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(items.length > 1 && pageWidth > 0)
    .minDistance(6)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onUpdate((event) => {
      const hasNext = activeIndex < items.length - 1;
      const hasPrevious = activeIndex > 0;
      let translationX = event.translationX;
      if (translationX > 0 && !hasNext) {
        translationX *= TRAVEL_MEDIA_PAGER_EDGE_RESISTANCE;
      } else if (translationX < 0 && !hasPrevious) {
        translationX *= TRAVEL_MEDIA_PAGER_EDGE_RESISTANCE;
      }
      dragTranslationX.value = Math.max(-pageWidth, Math.min(pageWidth, translationX));
    })
    .onEnd((event) => {
      const delta = travelMediaPagerDelta({
        translationX: event.translationX,
        translationY: event.translationY,
        velocityX: event.velocityX,
        pageWidth,
      });
      const canNavigate = delta > 0
        ? activeIndex < items.length - 1
        : delta < 0 && activeIndex > 0;
      if (!delta || !canNavigate) {
        dragTranslationX.value = withSpring(0, { damping: 22, stiffness: 260 });
        return;
      }
      const destination = delta > 0 ? pageWidth : -pageWidth;
      dragTranslationX.value = withTiming(destination, { duration: 180 }, (finished) => {
        if (!finished) return;
        runOnJS(onNavigate)(delta);
        dragTranslationX.value = 0;
      });
    })
    .onFinalize((_event, success) => {
      if (!success) dragTranslationX.value = withSpring(0, { damping: 22, stiffness: 260 });
    }), [activeIndex, dragTranslationX, items.length, onNavigate, pageWidth]);

  const pageIndices = [activeIndex + 1, activeIndex - 1, activeIndex]
    .filter((index) => index >= 0 && index < items.length);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={styles.embeddedPager} testID="travel-media-pager">
        {pageIndices.map((pageIndex) => (
          <EmbeddedMediaPagerPage
            key={travelMediaIdentity(items[pageIndex])}
            item={items[pageIndex]}
            pageIndex={pageIndex}
            activeIndex={activeIndex}
            pageWidth={pageWidth}
            dragTranslationX={dragTranslationX}
          />
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

function TravelMediaCropModal({
  visible,
  item,
  activeIndex = 0,
  itemCount = 1,
  aspect,
  onCancel,
  onComplete,
}) {
  const insets = useContext(SafeAreaInsetsContext) || ZERO_INSETS;
  const windowDimensions = useWindowDimensions();
  const identity = travelMediaIdentity(item);
  const [draftCrop, setDraftCrop] = useState(() => item?.transform?.crop || null);

  useEffect(() => {
    if (visible) setDraftCrop(item?.transform?.crop || null);
  }, [identity, item?.transform?.crop, visible]);

  if (!visible || !item) return null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={styles.cropModalScreen} testID="travel-media-crop-modal">
        <View style={[styles.cropModalContent, {
          paddingTop: Math.max(insets.top, spacing.sm),
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        }]}>
          <View style={styles.cropModalHeader}>
            <Pressable
              onPress={onCancel}
              style={styles.cropModalAction}
              accessibilityRole="button"
              accessibilityLabel="ביטול חיתוך"
              testID="travel-media-crop-cancel"
            >
              <AppText style={styles.cropModalCancelText}>ביטול</AppText>
            </Pressable>
            <View style={styles.cropModalHeaderCopy}>
              <AppText style={styles.cropModalTitle}>חיתוך תמונה</AppText>
              <View style={styles.cropModalCounterRow}>
                <AppText style={[styles.cropModalCounter, styles.cropModalIndex]} testID="travel-media-crop-counter">
                  {`${activeIndex + 1}/${itemCount}`}
                </AppText>
                <AppText style={styles.cropModalCounter}> · החיתוך יישמר רק לאחר סיום</AppText>
              </View>
            </View>
            <Pressable
              onPress={() => onComplete(draftCrop)}
              disabled={!draftCrop}
              style={[styles.cropModalAction, !draftCrop && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="סיום חיתוך"
              testID="travel-media-crop-confirm"
            >
              <AppText style={styles.cropModalConfirmText}>סיום</AppText>
            </Pressable>
          </View>
          <View style={styles.cropModalStage}>
            <CropPage
              key={identity}
              item={item}
              aspect={aspect}
              cropEnabled
              navigationEnabled={false}
              maxViewportWidth={windowDimensions.width}
              onCropChange={setDraftCrop}
              onSwipe={() => {}}
            />
          </View>
          <AppText style={styles.cropModalHint}>גררו את התמונה וצבטו כדי להגדיל</AppText>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ReorderableMediaThumb({
  item,
  index,
  itemCount,
  itemCenters,
  thumbnailSize,
  selected,
  dragging,
  activeDragIndex,
  targetDragIndex,
  dragTranslationX,
  onPress,
  onBegin,
  onDrop,
  onRelease,
  onLayout,
  onAccessibilityMove,
}) {
  const identity = travelMediaIdentity(item);
  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(TRAVEL_MEDIA_REORDER_LONG_PRESS_MS)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      activeDragIndex.value = index;
      targetDragIndex.value = index;
      dragTranslationX.value = 0;
      runOnJS(onBegin)(index);
    })
    .onUpdate((event) => {
      const bounds = travelMediaReorderTranslationBounds({ fromIndex: index, itemCenters });
      const translationX = Math.max(bounds.minimum, Math.min(bounds.maximum, event.translationX));
      dragTranslationX.value = translationX;
      targetDragIndex.value = travelMediaReorderTargetIndex({
        fromIndex: index,
        translationX,
        itemCenters,
      });
    })
    .onEnd(() => {
      runOnJS(onDrop)(index, targetDragIndex.value);
    })
    .onFinalize(() => {
      activeDragIndex.value = -1;
      targetDragIndex.value = -1;
      dragTranslationX.value = 0;
      runOnJS(onRelease)();
    }), [
    activeDragIndex,
    dragTranslationX,
    index,
    itemCenters,
    itemCount,
    onBegin,
    onDrop,
    onRelease,
    targetDragIndex,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    const activeIndex = activeDragIndex.value;
    const targetIndex = targetDragIndex.value;
    if (activeIndex === index) {
      return {
        zIndex: 20,
        elevation: 12,
        shadowOpacity: 0.28,
        transform: [
          { translateX: dragTranslationX.value },
          { scale: 1.1 },
        ],
      };
    }

    const translateX = travelMediaReorderNeighborTranslation({
      index,
      activeIndex,
      targetIndex,
      itemCenters,
    });
    return {
      zIndex: 1,
      elevation: 0,
      shadowOpacity: 0,
      transform: [
        { translateX: withSpring(translateX, { damping: 20, stiffness: 260 }) },
        { scale: withSpring(1, { damping: 18, stiffness: 240 }) },
      ],
    };
  }, [index, itemCenters]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.embeddedThumbSurface, { width: thumbnailSize, height: thumbnailSize }, animatedStyle]}
        onLayout={(event) => onLayout(index, event.nativeEvent.layout)}
        testID={`travel-media-drag-surface-${identity}`}
      >
        <Pressable
          style={[
            styles.selectedThumb,
            styles.embeddedThumb,
            { width: thumbnailSize, height: thumbnailSize },
            selected && styles.selectedThumbActive,
            dragging && styles.embeddedThumbDragging,
          ]}
          onPress={() => onPress(index)}
          accessibilityRole="button"
          accessibilityLabel={`תמונה ${index + 1}; לחיצה ארוכה וגרירה לשינוי סדר`}
          accessibilityState={{ selected }}
          accessibilityActions={[
            ...(index > 0 ? [{ name: 'moveUp', label: 'העברה אחורה' }] : []),
            ...(index < itemCount - 1 ? [{ name: 'moveDown', label: 'העברה קדימה' }] : []),
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'moveUp') onAccessibilityMove(index, index - 1);
            if (nativeEvent.actionName === 'moveDown') onAccessibilityMove(index, index + 1);
          }}
          testID={`travel-media-selected-${identity}`}
        >
          <MediaImage uri={travelMediaUri(item)} style={styles.selectedThumbImage} contentFit="cover" />
          <SelectionBadge number={index + 1} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export default function TravelMediaComposer({
  visible,
  value = [],
  maxItems = 5,
  aspect = [1, 1],
  maxLongEdge = 1600,
  compress = 0.94,
  onChange,
  onCancel,
  contained = false,
  embedded = false,
  addButtonTestID,
  onReorderInteractionChange,
  sourceAdapter: suppliedSourceAdapter,
  sourceAdapters,
}) {
  const defaultSourceAdapter = useTravelMediaSource({ maxItems });
  const sourceAdapter = suppliedSourceAdapter || sourceAdapters?.[Platform.OS] || defaultSourceAdapter;
  const insets = useContext(SafeAreaInsetsContext) || ZERO_INSETS;
  const windowDimensions = useWindowDimensions();
  const [working, setWorking] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [composerError, setComposerError] = useState('');
  const [cropEditing, setCropEditing] = useState(false);
  const [reorderTrackWidth, setReorderTrackWidth] = useState(0);
  const [reorderCenters, setReorderCenters] = useState([]);
  const [draggingIndex, setDraggingIndex] = useState(-1);
  const activeDragIndex = useSharedValue(-1);
  const targetDragIndex = useSharedValue(-1);
  const dragTranslationX = useSharedValue(0);
  const workingRef = useRef(working);
  workingRef.current = working;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const reorderInteractionActiveRef = useRef(false);
  const reorderInteractionCallbackRef = useRef(onReorderInteractionChange);
  reorderInteractionCallbackRef.current = onReorderInteractionChange;
  const ratio = (Number(aspect?.[0]) || 1) / (Number(aspect?.[1]) || 1);
  const embeddedPreviewWidth = travelMediaEmbeddedPreviewWidth(windowDimensions.width);
  const options = useMemo(() => ({ aspect, maxItems, maxLongEdge, compress }), [
    aspect, compress, maxItems, maxLongEdge,
  ]);

  useEffect(() => {
    if (!visible) return;
    setWorking(mergeTravelMediaSelection([], value, options));
    setActiveIndex(0);
    setComposerError('');
    setCropEditing(false);
    sourceAdapter.kind === 'inline-library' && sourceAdapter.loadInitial().catch(() => {});
  }, [visible]); // The draft is intentionally captured only when the composer opens.

  useEffect(() => {
    if (!embedded || !visible) return;
    setWorking(mergeTravelMediaSelection([], value, options));
  }, [embedded, options, value, visible]);

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, Math.max(0, working.length - 1))));
    setReorderCenters((current) => current.slice(0, working.length));
  }, [working.length]);

  const materializeSelection = useCallback(async (descriptor) => {
    if (descriptor.persistence === 'ready' || descriptor.type === 'remote') return descriptor;
    setWorking((current) => {
      const next = current.map((item) => travelMediaIdentity(item) === travelMediaIdentity(descriptor)
        ? { ...item, persistence: 'materializing' }
        : item);
      if (embedded) Promise.resolve().then(() => onChange?.(next));
      return next;
    });
    try {
      const materialized = await sourceAdapter.materialize(descriptor);
      const normalized = createTravelMediaDescriptor(materialized, { ...options, newSource: true });
      setWorking((current) => {
        const next = current.map((item) => travelMediaIdentity(item) === travelMediaIdentity(descriptor)
          ? normalized
          : item);
        if (embedded) Promise.resolve().then(() => onChange?.(next));
        return next;
      });
      return normalized;
    } catch (error) {
      setWorking((current) => {
        const next = current.map((item) => travelMediaIdentity(item) === travelMediaIdentity(descriptor)
          ? { ...item, persistence: 'failed' }
          : item);
        if (embedded) Promise.resolve().then(() => onChange?.(next));
        return next;
      });
      setComposerError('לא הצלחנו להוריד את התמונה. אפשר לנסות שוב או לבחור תמונה אחרת.');
      throw error;
    }
  }, [embedded, onChange, options, sourceAdapter]);

  const addDescriptors = useCallback((additions) => {
    const next = mergeTravelMediaSelection(working, additions, { ...options, newSource: true });
    const currentIds = new Set(working.map(travelMediaIdentity));
    const added = next.filter((item) => !currentIds.has(travelMediaIdentity(item)));
    setWorking(next);
    if (embedded) onChange?.(next);
    if (added.length) setActiveIndex(next.findIndex((item) => travelMediaIdentity(item) === travelMediaIdentity(added[0])));
    setComposerError('');
    Promise.resolve().then(() => added.forEach((item) => materializeSelection(item).catch(() => {})));
  }, [embedded, materializeSelection, onChange, options, working]);

  const selectAsset = useCallback((asset) => {
    const identity = travelMediaIdentity(asset);
    const existingIndex = working.findIndex((item) => travelMediaIdentity(item) === identity);
    if (existingIndex >= 0) {
      setActiveIndex(existingIndex);
      return;
    }
    if (working.length >= maxItems) {
      setComposerError(`אפשר לבחור עד ${maxItems} תמונות.`);
      return;
    }
    addDescriptors([asset]);
  }, [addDescriptors, maxItems, working]);

  const removeActive = useCallback(() => {
    setWorking((current) => {
      if (!current.length) return current;
      const next = current.filter((_, index) => index !== activeIndex);
      setActiveIndex((index) => Math.max(0, Math.min(index, Math.max(0, next.length - 1))));
      if (embedded) Promise.resolve().then(() => onChange?.(next));
      return next;
    });
    setComposerError('');
  }, [activeIndex, embedded, onChange]);

  const navigateBySwipe = useCallback((delta) => {
    setActiveIndex((current) => Math.max(0, Math.min(current + delta, Math.max(0, working.length - 1))));
  }, [working.length]);

  const pickMore = useCallback(async () => {
    if (working.length >= maxItems) return;
    try {
      const additions = await sourceAdapter.pickMore(maxItems - working.length);
      if (!additions?.length) return;
      addDescriptors(additions);
    } catch {
      setComposerError('לא הצלחנו לפתוח את בחירת התמונות. אפשר לנסות שוב.');
    }
  }, [addDescriptors, maxItems, sourceAdapter, working.length]);

  const updateCrop = useCallback((identity, crop) => {
    setWorking((current) => {
      const next = current.map((item) => travelMediaIdentity(item) === identity
        ? updateTravelMediaCrop(item, crop)
        : item);
      if (embedded) Promise.resolve().then(() => onChange?.(next));
      return next;
    });
  }, [embedded, onChange]);

  const setReorderInteractionActive = useCallback((active) => {
    const nextActive = Boolean(active);
    if (reorderInteractionActiveRef.current === nextActive) return;
    reorderInteractionActiveRef.current = nextActive;
    reorderInteractionCallbackRef.current?.(nextActive);
  }, []);

  const beginReorder = useCallback((index) => {
    setActiveIndex(index);
    setDraggingIndex(index);
    setReorderInteractionActive(true);
  }, [setReorderInteractionActive]);

  const releaseReorder = useCallback(() => {
    setDraggingIndex(-1);
    setReorderInteractionActive(false);
  }, [setReorderInteractionActive]);

  const finishReorder = useCallback((fromIndex, toIndex) => {
    const current = workingRef.current;
    const next = reorderTravelMediaItems(current, fromIndex, toIndex);
    if (next === current) return;
    workingRef.current = next;
    setWorking(next);
    setActiveIndex(toIndex);
    if (embedded) onChangeRef.current?.(next);
  }, [embedded]);

  useEffect(() => () => {
    if (!reorderInteractionActiveRef.current) return;
    reorderInteractionActiveRef.current = false;
    reorderInteractionCallbackRef.current?.(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      setDraggingIndex(-1);
      setReorderInteractionActive(false);
    }
  }, [setReorderInteractionActive, visible]);

  const moveForAccessibility = useCallback((fromIndex, toIndex) => {
    finishReorder(fromIndex, toIndex);
  }, [finishReorder]);

  const registerReorderLayout = useCallback((index, layout) => {
    const center = Number(layout?.x) + Number(layout?.width) / 2;
    if (!Number.isFinite(center)) return;
    setReorderCenters((current) => {
      if (current[index] === center) return current;
      const next = current.slice();
      next[index] = center;
      return next;
    });
  }, []);

  const retryFailed = useCallback(() => {
    setComposerError('');
    working.filter((item) => item.persistence === 'failed')
      .forEach((item) => materializeSelection(item).catch(() => {}));
  }, [materializeSelection, working]);

  const pending = working.some((item) => item.persistence === 'materializing');
  const failed = working.some((item) => item.persistence === 'failed');
  const permissionBlocked = sourceAdapter.kind === 'inline-library'
    && sourceAdapter.permission
    && !sourceAdapter.permission.granted;
  const gridItems = sourceAdapter.kind === 'inline-library' ? sourceAdapter.assets : [];

  useEffect(() => {
    if (!visible || !permissionBlocked || sourceAdapter.permission.canAskAgain !== false) return undefined;
    let openedSettings = false;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        openedSettings = true;
      } else if (nextState === 'active' && openedSettings) {
        openedSettings = false;
        sourceAdapter.loadInitial().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [permissionBlocked, sourceAdapter, visible]);

  if (embedded) {
    if (!visible) return null;
    const activeItem = working[activeIndex];
    const reorderGap = spacing.sm;
    const availableThumbnailWidth = reorderTrackWidth > 0
      ? (reorderTrackWidth - Math.max(0, working.length - 1) * reorderGap) / Math.max(1, working.length)
      : TRAVEL_MEDIA_REORDER_MIN_THUMB_SIZE;
    const reorderThumbnailSize = Math.max(
      TRAVEL_MEDIA_REORDER_MIN_THUMB_SIZE,
      Math.min(TRAVEL_MEDIA_REORDER_MAX_THUMB_SIZE, Math.floor(availableThumbnailWidth))
    );
    return (
      <GestureHandlerRootView
        style={styles.embeddedRoot}
        onTouchCancelCapture={releaseReorder}
        testID="travel-media-composer"
      >
        {!working.length ? (
          <Pressable
            style={[styles.embeddedEmpty, { aspectRatio: ratio }]}
            onPress={pickMore}
            accessibilityRole="button"
            accessibilityLabel="הוספת תמונות מהגלריה"
            testID={addButtonTestID || 'travel-media-embedded-add'}
          >
            <View style={styles.embeddedAddIcon}><Ionicons name="add" size={28} color={colors.white} /></View>
            <AppText style={styles.embeddedEmptyTitle}>הוספת תמונות</AppText>
            <AppText style={styles.embeddedEmptyText}>לחיצה אחת פותחת את הגלריה</AppText>
          </Pressable>
        ) : (
          <>
            <View
              style={[
                styles.previewWrap,
                styles.embeddedPreview,
                {
                  width: embeddedPreviewWidth,
                  height: embeddedPreviewWidth / ratio,
                  maxHeight: embeddedPreviewWidth / ratio,
                  borderRadius: embeddedPreviewWidth >= windowDimensions.width
                    ? 0
                    : spacing.radiusLarge,
                },
              ]}
              testID="travel-media-embedded-preview"
            >
              <EmbeddedMediaPager
                items={working}
                activeIndex={activeIndex}
                pageWidth={embeddedPreviewWidth}
                onNavigate={navigateBySwipe}
              />
              <View style={styles.previewTools} pointerEvents="box-none">
                <View style={styles.activeBadge} pointerEvents="none">
                  <AppText style={styles.activeBadgeText} testID="travel-media-active-counter">
                    {`${activeIndex + 1}/${working.length}`}
                  </AppText>
                </View>
              </View>
              <AppText style={styles.cropHint}>
                החליקו ימינה או שמאלה כדי לעבור בין התמונות
              </AppText>
            </View>
            <View style={styles.embeddedActions}>
              <Pressable
                style={styles.embeddedAction}
                onPress={() => setCropEditing(true)}
                disabled={!activeItem?.transform}
                testID="travel-media-toggle-crop"
              >
                <Ionicons name="crop-outline" size={20} color={colors.primary} />
                <AppText style={styles.embeddedActionText}>חיתוך</AppText>
              </Pressable>
              {working.length < maxItems ? (
                <Pressable style={styles.embeddedAction} onPress={pickMore} testID="travel-media-pick-more">
                  <Ionicons name="images-outline" size={20} color={colors.primary} />
                  <AppText style={styles.embeddedActionText}>הוספה</AppText>
                </Pressable>
              ) : null}
              <Pressable style={styles.embeddedAction} onPress={removeActive} testID="travel-media-delete-active">
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <AppText style={[styles.embeddedActionText, styles.embeddedDeleteText]}>מחיקה</AppText>
              </Pressable>
            </View>
            <AppText style={styles.embeddedReorderHint}>לחיצה ארוכה וגרירה משנה את סדר התמונות</AppText>
            <View
              style={styles.embeddedReorderTrack}
              onLayout={(event) => setReorderTrackWidth(Math.max(0, event.nativeEvent.layout.width))}
              testID="travel-media-reorder-list"
            >
              {working.map((item, index) => (
                <ReorderableMediaThumb
                  key={travelMediaIdentity(item)}
                  item={item}
                  index={index}
                  itemCount={working.length}
                  itemCenters={reorderCenters}
                  thumbnailSize={reorderThumbnailSize}
                  selected={index === activeIndex}
                  dragging={index === draggingIndex}
                  activeDragIndex={activeDragIndex}
                  targetDragIndex={targetDragIndex}
                  dragTranslationX={dragTranslationX}
                  onPress={setActiveIndex}
                  onBegin={beginReorder}
                  onDrop={finishReorder}
                  onRelease={releaseReorder}
                  onLayout={registerReorderLayout}
                  onAccessibilityMove={moveForAccessibility}
                />
              ))}
            </View>
          </>
        )}
        {pending ? <ActivityIndicator style={styles.embeddedStatus} color={colors.primary} /> : null}
        {(composerError || sourceAdapter.error) ? (
          <View style={styles.errorRow} testID="travel-media-error">
            <AppText style={styles.errorText}>{composerError || sourceAdapter.error}</AppText>
            {failed ? <Pressable onPress={retryFailed}><AppText style={styles.retryText}>ניסיון נוסף</AppText></Pressable> : null}
          </View>
        ) : null}
        <TravelMediaCropModal
          visible={cropEditing && Boolean(activeItem?.transform)}
          item={activeItem}
          activeIndex={activeIndex}
          itemCount={working.length}
          aspect={aspect}
          onCancel={() => setCropEditing(false)}
          onComplete={(crop) => {
            updateCrop(travelMediaIdentity(activeItem), crop);
            setCropEditing(false);
          }}
        />
      </GestureHandlerRootView>
    );
  }

  const content = (
    <GestureHandlerRootView style={styles.screen}>
      <View style={[styles.screen, {
        paddingTop: Math.max(insets.top, spacing.sm),
        paddingBottom: Math.max(insets.bottom, spacing.sm),
      }]} testID="travel-media-composer">
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerSecondary} testID="travel-media-cancel">
            <AppText style={styles.headerSecondaryText}>ביטול</AppText>
          </Pressable>
          <View style={styles.headerCopy}>
            <AppText style={styles.title}>התאמת תמונות</AppText>
            <AppText style={styles.counter}>{working.length} מתוך {maxItems}</AppText>
          </View>
          <Pressable
            onPress={() => onChange?.(working)}
            disabled={pending || failed}
            style={[styles.doneButton, (pending || failed) && styles.disabled]}
            testID="travel-media-done"
          >
            <AppText style={styles.doneText}>שמירה</AppText>
          </Pressable>
        </View>

        <View style={[styles.previewWrap, { aspectRatio: ratio }]}>
          {working.length ? (
            <EmbeddedMediaPager
              items={working}
              activeIndex={activeIndex}
              pageWidth={Math.max(1, Number(windowDimensions.width) || embeddedPreviewWidth)}
              onNavigate={navigateBySwipe}
            />
          ) : (
            <View style={styles.emptyPreview}>
              <Ionicons name="images-outline" size={38} color={colors.textMuted} />
              <AppText style={styles.emptyText}>בחרו תמונות מהגלריה</AppText>
            </View>
          )}
          {working.length ? <>
            <View style={styles.previewTools} pointerEvents="box-none">
              <Pressable
                style={[styles.deleteButton, styles.cropPreviewButton]}
                onPress={() => setCropEditing(true)}
                disabled={!working[activeIndex]?.transform}
                accessibilityLabel="חיתוך התמונה הנוכחית"
                testID="travel-media-toggle-crop"
              >
                <Ionicons name="crop-outline" size={18} color={colors.white} />
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={removeActive}
                accessibilityLabel="מחיקת התמונה הנוכחית"
                testID="travel-media-delete-active"
              >
                <Ionicons name="trash-outline" size={18} color={colors.white} />
              </Pressable>
              <View style={styles.activeBadge} pointerEvents="none">
                <AppText style={styles.activeBadgeText}>{activeIndex + 1}/{working.length}</AppText>
              </View>
            </View>
            <AppText style={styles.cropHint}>
              {working[activeIndex]?.transform
                ? 'גרירה איטית לחיתוך · צביטה להגדלה · החלקה מהירה למעבר'
                : 'החלקה מהירה עוברת בין התמונות' }
            </AppText>
          </> : null}
        </View>

        <View style={styles.selectionPanel}>
          <View style={styles.libraryHeader}>
          <AppText style={styles.libraryTitle}>
            התמונות שנבחרו
          </AppText>
          <AppText style={styles.selectionHint}>החיתוך נשמר בנפרד לכל תמונה</AppText>
          </View>
          <RtlHorizontalScrollView contentContainerStyle={styles.selectedStrip} testID="travel-media-selected-strip">
            {working.map((item, index) => {
              const identity = travelMediaIdentity(item);
              const selected = index === activeIndex;
              return (
                <Pressable
                  key={identity}
                  style={[styles.selectedThumb, selected && styles.selectedThumbActive]}
                  onPress={() => setActiveIndex(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`בחירת תמונה ${index + 1}`}
                  accessibilityState={{ selected }}
                  testID={`travel-media-selected-${identity}`}
                >
                  <MediaImage uri={travelMediaUri(item)} style={styles.selectedThumbImage} contentFit="cover" />
                  <SelectionBadge number={index + 1} />
                </Pressable>
              );
            })}
            {working.length < maxItems ? (
              <Pressable style={styles.addThumb} onPress={pickMore} testID="travel-media-pick-more">
                <Ionicons name="add" size={20} color={colors.primary} />
                <AppText style={styles.addThumbText}>הוספה</AppText>
              </Pressable>
            ) : null}
          </RtlHorizontalScrollView>
        </View>

        {!permissionBlocked && sourceAdapter.kind === 'inline-library' && sourceAdapter.albums?.length ? (
          <><View style={styles.galleryHeading}><AppText style={styles.libraryTitle}>גלריה</AppText></View>
          <RtlHorizontalScrollView style={styles.albums} contentContainerStyle={styles.albumsContent}>
            <Pressable style={[styles.albumChip, !sourceAdapter.selectedAlbum && styles.albumChipSelected]} onPress={() => sourceAdapter.chooseAlbum(null).catch(() => {})}>
              <AppText style={styles.albumChipText}>אחרונות</AppText>
            </Pressable>
            {sourceAdapter.albums.map((album) => (
              <Pressable key={album.id} style={[styles.albumChip, sourceAdapter.selectedAlbum?.id === album.id && styles.albumChipSelected]} onPress={() => sourceAdapter.chooseAlbum(album).catch(() => {})}>
                <AppText style={styles.albumChipText}>{album.title}</AppText>
              </Pressable>
            ))}
          </RtlHorizontalScrollView></>
        ) : null}

        {!permissionBlocked && sourceAdapter.permission?.accessPrivileges === 'limited' ? (
          <Pressable style={styles.limitedButton} onPress={() => sourceAdapter.requestMoreAccess().catch(() => {})}>
            <AppText style={styles.limitedText}>בחירת תמונות נוספות מהספרייה</AppText>
          </Pressable>
        ) : null}

        {permissionBlocked ? (
          <View style={styles.permissionPanel} testID="travel-media-permission-panel">
            <Ionicons name="images-outline" size={34} color={colors.primary} />
            <AppText style={styles.permissionTitle}>נדרשת גישה לתמונות</AppText>
            <AppText style={styles.permissionText}>
              {sourceAdapter.permission.canAskAgain === false
                ? 'כדי להציג את הגלריה, אפשרו ל־PlanLi גישה לתמונות בהגדרות של ה־iPhone.'
                : 'כדי להציג את הגלריה, אפשרו ל־PlanLi גישה לתמונות.'}
            </AppText>
            <Pressable
              style={styles.permissionButton}
              onPress={() => {
                if (sourceAdapter.permission.canAskAgain === false) {
                  Linking.openSettings().catch(() => {});
                  return;
                }
                sourceAdapter.loadInitial().catch(() => {});
              }}
              testID="travel-media-permission-action"
            >
              <AppText style={styles.permissionButtonText}>
                {sourceAdapter.permission.canAskAgain === false ? 'פתיחת הגדרות' : 'מתן גישה לתמונות'}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {(composerError || (sourceAdapter.error && !permissionBlocked)) ? (
          <View style={styles.errorRow} testID="travel-media-error">
            <AppText style={styles.errorText}>{composerError || sourceAdapter.error}</AppText>
            {failed ? <Pressable onPress={retryFailed}><AppText style={styles.retryText}>ניסיון נוסף</AppText></Pressable> : null}
          </View>
        ) : null}

        <TravelMediaCropModal
          visible={cropEditing && Boolean(working[activeIndex]?.transform)}
          item={working[activeIndex]}
          activeIndex={activeIndex}
          itemCount={working.length}
          aspect={aspect}
          onCancel={() => setCropEditing(false)}
          onComplete={(crop) => {
            updateCrop(travelMediaIdentity(working[activeIndex]), crop);
            setCropEditing(false);
          }}
        />

        {!permissionBlocked && sourceAdapter.kind === 'inline-library' ? <FlatList
          data={gridItems}
          extraData={working}
          keyExtractor={travelMediaIdentity}
          numColumns={3}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          onEndReached={sourceAdapter.kind === 'inline-library'
            ? () => sourceAdapter.loadMore().catch(() => {})
            : undefined}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => {
            const identity = travelMediaIdentity(item);
            const selectedIndex = working.findIndex((selected) => travelMediaIdentity(selected) === identity);
            const uri = travelMediaUri(item);
            return (
               <Pressable style={styles.gridTile} onPress={() => selectAsset(item)} testID={`travel-media-item-${identity}`}>
                <MediaImage
                  uri={uri}
                  style={styles.gridImage}
                  contentFit="cover"
                  testID={`travel-media-thumbnail-${identity}`}
                />
                <SelectionBadge number={selectedIndex >= 0 ? selectedIndex + 1 : 0} />
                {item.persistence === 'materializing' ? <View style={styles.tileLoading}><ActivityIndicator color={colors.white} /></View> : null}
                {item.persistence === 'failed' ? <View style={styles.tileLoading}><Ionicons name="alert-circle" size={24} color={colors.white} /></View> : null}
              </Pressable>
            );
          }}
          ListFooterComponent={sourceAdapter.loading
            ? <ActivityIndicator style={styles.gridLoader} color={colors.primary} />
            : null}
          testID="travel-media-grid"
        /> : null}
      </View>
    </GestureHandlerRootView>
  );

  if (contained) {
    if (!visible) return null;
    return <View style={styles.contained}>{content}</View>;
  }
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  contained: { ...StyleSheet.absoluteFillObject, zIndex: 120, backgroundColor: colors.background },
  embeddedRoot: { width: '100%', backgroundColor: colors.white },
  embeddedEmpty: { width: '100%', minHeight: 210, borderRadius: spacing.radiusLarge, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  embeddedAddIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  embeddedEmptyTitle: { color: colors.textPrimary, fontSize: 17 },
  embeddedEmptyText: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  embeddedPreview: { alignSelf: 'center', borderRadius: spacing.radiusLarge },
  embeddedPager: { flex: 1, overflow: 'hidden', backgroundColor: '#101317' },
  embeddedPagerPage: { ...StyleSheet.absoluteFillObject },
  embeddedPagerImage: { width: '100%', height: '100%' },
  cropPreviewButton: { marginLeft: spacing.xs },
  cropModalScreen: { flex: 1, backgroundColor: '#101317' },
  cropModalContent: { flex: 1, backgroundColor: '#101317' },
  cropModalHeader: { minHeight: 58, paddingHorizontal: spacing.lg, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.14)' },
  cropModalHeaderCopy: { alignItems: 'center', flex: 1 },
  cropModalTitle: { color: colors.white, fontSize: 17 },
  cropModalCounterRow: { flexDirection: 'row', alignItems: 'center' },
  cropModalCounter: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
  cropModalIndex: { writingDirection: 'ltr', direction: 'ltr' },
  cropModalAction: { minWidth: 62, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  cropModalCancelText: { color: 'rgba(255,255,255,0.78)', fontSize: 14 },
  cropModalConfirmText: { color: colors.accentAction, fontSize: 14 },
  cropModalStage: { flex: 1, width: '100%', backgroundColor: '#101317' },
  cropModalHint: { color: 'rgba(255,255,255,0.72)', fontSize: 13, textAlign: 'center', writingDirection: 'rtl', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  embeddedActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  embeddedAction: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: spacing.radiusFull, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  embeddedActionActive: { borderColor: colors.primary, backgroundColor: colors.accentLight },
  embeddedActionText: { color: colors.primary, fontSize: 13 },
  embeddedDeleteText: { color: colors.error },
  embeddedReorderHint: { color: colors.textSecondary, fontSize: 12, textAlign: 'right', writingDirection: 'rtl', marginTop: spacing.md, marginBottom: spacing.xs },
  embeddedReorderTrack: { width: '100%', minHeight: 96, overflow: 'visible', flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  embeddedThumbSurface: { overflow: 'visible', borderRadius: spacing.radiusSmall, backgroundColor: colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowRadius: 8 },
  embeddedThumb: { width: 76, height: 76 },
  embeddedThumbDragging: { borderColor: colors.accentAction, borderWidth: 4 },
  embeddedStatus: { marginTop: spacing.sm },
  header: { height: 58, paddingHorizontal: spacing.lg, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  headerCopy: { alignItems: 'center' },
  title: { fontSize: 17, color: colors.textPrimary },
  counter: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  headerSecondary: { minWidth: 62, alignItems: 'center', paddingVertical: spacing.sm },
  headerSecondaryText: { color: colors.textSecondary },
  doneButton: { minWidth: 62, borderRadius: spacing.radiusSmall, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  doneText: { color: colors.white },
  disabled: { opacity: 0.45 },
  previewWrap: { width: '100%', maxHeight: 470, backgroundColor: '#101317', overflow: 'hidden' },
  cropStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cropViewport: { overflow: 'hidden', backgroundColor: '#090B0E' },
  gestureSurface: { flex: 1 },
  cropImageWrap: { position: 'absolute' },
  cropImage: { width: '100%', height: '100%' },
  cropGrid: { ...StyleSheet.absoluteFillObject },
  cropGridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.55)' },
  cropGridVerticalOne: { top: 0, bottom: 0, left: '33.333%', width: StyleSheet.hairlineWidth },
  cropGridVerticalTwo: { top: 0, bottom: 0, left: '66.666%', width: StyleSheet.hairlineWidth },
  cropGridHorizontalOne: { left: 0, right: 0, top: '33.333%', height: StyleSheet.hairlineWidth },
  cropGridHorizontalTwo: { left: 0, right: 0, top: '66.666%', height: StyleSheet.hairlineWidth },
  uncroppedPage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  uncroppedImage: { width: '100%', height: '100%' },
  existingHint: { position: 'absolute', bottom: spacing.xl, color: colors.white, fontSize: 12 },
  emptyPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.textMuted },
  previewTools: { ...StyleSheet.absoluteFillObject, padding: spacing.md, flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  deleteButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,20,22,0.72)' },
  activeBadge: { minWidth: 38, height: 38, paddingHorizontal: spacing.sm, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,20,22,0.72)' },
  activeBadgeText: { color: colors.white, fontSize: 12, textAlign: 'center', writingDirection: 'ltr', direction: 'ltr' },
  cropHint: { position: 'absolute', bottom: spacing.sm, left: spacing.md, right: spacing.md, color: colors.white, fontSize: 12, textAlign: 'center', writingDirection: 'rtl' },
  selectionPanel: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  libraryHeader: { minHeight: 48, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white },
  libraryTitle: { fontSize: 16, color: colors.textPrimary },
  selectionHint: { flexShrink: 1, color: colors.textSecondary, fontSize: 12, textAlign: 'left' },
  selectedStrip: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  selectedThumb: { width: 74, height: 74, borderRadius: spacing.radiusSmall, overflow: 'hidden', borderWidth: 2, borderColor: colors.border, backgroundColor: colors.borderLight },
  selectedThumbActive: { borderColor: colors.primary, borderWidth: 3 },
  selectedThumbImage: { width: '100%', height: '100%' },
  addThumb: { width: 74, height: 74, borderRadius: spacing.radiusSmall, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  addThumbText: { color: colors.primary, fontSize: 12, marginTop: 2 },
  galleryHeading: { minHeight: 42, paddingHorizontal: spacing.lg, justifyContent: 'center', backgroundColor: colors.white },
  albums: { flexGrow: 0, backgroundColor: colors.white },
  albumsContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  albumChip: { marginHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: spacing.radiusFull, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  albumChipSelected: { borderColor: colors.primary, backgroundColor: colors.accentLight },
  albumChipText: { color: colors.textPrimary, fontSize: 13 },
  limitedButton: { backgroundColor: colors.infoLight, paddingVertical: spacing.sm, alignItems: 'center' },
  limitedText: { color: colors.info, fontSize: 13 },
  errorRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.errorLight, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  errorText: { flex: 1, color: colors.error, textAlign: 'right', fontSize: 13 },
  retryText: { color: colors.primary, marginRight: spacing.md },
  permissionPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm, backgroundColor: colors.white },
  permissionTitle: { color: colors.textPrimary, fontSize: 17, textAlign: 'center' },
  permissionText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', writingDirection: 'rtl' },
  permissionButton: { marginTop: spacing.sm, borderRadius: spacing.radiusSmall, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  permissionButtonText: { color: colors.white, fontSize: 14 },
  grid: { padding: 1, paddingBottom: spacing.xxl },
  gridRow: { flexDirection: 'row-reverse' },
  gridTile: { flex: 1 / 3, maxWidth: '33.333%', aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%', backgroundColor: colors.borderLight },
  badge: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 25, height: 25, borderRadius: 13, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: 12, textAlign: 'center', writingDirection: 'ltr', direction: 'ltr' },
  tileLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  gridLoader: { marginVertical: spacing.lg },
});
