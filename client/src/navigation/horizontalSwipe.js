import { PanResponder } from 'react-native';
import { useMemo } from 'react';

export const HORIZONTAL_SWIPE_ACTIVATION_DISTANCE = 12;
export const HORIZONTAL_SWIPE_COMMIT_DISTANCE = 48;
export const HORIZONTAL_SWIPE_COMMIT_VELOCITY = 0.45;
export const HORIZONTAL_SWIPE_DOMINANCE_RATIO = 1.25;

export function shouldCaptureHorizontalSwipe({ dx = 0, dy = 0 } = {}) {
  const horizontalDistance = Math.abs(dx);
  return horizontalDistance >= HORIZONTAL_SWIPE_ACTIVATION_DISTANCE
    && horizontalDistance >= Math.abs(dy) * HORIZONTAL_SWIPE_DOMINANCE_RATIO;
}

export function getCommittedSwipeDirection({ dx = 0, vx = 0 } = {}) {
  const committed = Math.abs(dx) >= HORIZONTAL_SWIPE_COMMIT_DISTANCE
    || Math.abs(vx) >= HORIZONTAL_SWIPE_COMMIT_VELOCITY;
  if (!committed || dx === 0) return null;
  return dx < 0 ? 'left' : 'right';
}

export function getAdjacentSwipeIndex({
  activeIndex,
  itemCount,
  direction,
  swipeLeftDelta = 1,
}) {
  if (!Number.isInteger(activeIndex) || itemCount <= 0 || !direction) return activeIndex;
  const delta = direction === 'left' ? swipeLeftDelta : -swipeLeftDelta;
  const targetIndex = activeIndex + delta;
  return targetIndex >= 0 && targetIndex < itemCount ? targetIndex : activeIndex;
}

export function resolveAdjacentSwipe({
  activeIndex,
  itemCount,
  gestureState,
  swipeLeftDelta = 1,
}) {
  return getAdjacentSwipeIndex({
    activeIndex,
    itemCount,
    direction: getCommittedSwipeDirection(gestureState),
    swipeLeftDelta,
  });
}

export function getAdjacentSwipeItem({
  items,
  activeIndex,
  gestureState,
  swipeLeftDelta = 1,
}) {
  const targetIndex = resolveAdjacentSwipe({
    activeIndex,
    itemCount: items?.length || 0,
    gestureState,
    swipeLeftDelta,
  });
  return targetIndex === activeIndex ? null : items?.[targetIndex] || null;
}

export function navigateToAdjacentSwipeItem({ navigation, gestureState }) {
  if (typeof navigation?.getState !== 'function' || typeof navigation?.navigate !== 'function') {
    return null;
  }
  const state = navigation.getState();
  const targetItem = getAdjacentSwipeItem({
    items: state?.routes,
    activeIndex: state?.index,
    gestureState,
  });
  if (!targetItem) return null;
  navigation.navigate(targetItem.name, targetItem.params);
  return targetItem;
}

export function useHorizontalSwipeResponder({
  enabled = true,
  onMove,
  onRelease,
  onCancel,
}) {
  return useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => (
      enabled && shouldCaptureHorizontalSwipe(gestureState)
    ),
    onMoveShouldSetPanResponderCapture: (_, gestureState) => (
      enabled && shouldCaptureHorizontalSwipe(gestureState)
    ),
    onPanResponderMove: (_, gestureState) => onMove?.(gestureState),
    onPanResponderRelease: (_, gestureState) => onRelease?.(gestureState),
    onPanResponderTerminate: () => onCancel?.(),
    onPanResponderTerminationRequest: () => true,
  }), [enabled, onCancel, onMove, onRelease]);
}
