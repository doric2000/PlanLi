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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ScaleDecorator, ShadowDecorator } from 'react-native-draggable-flatlist';

import AppText from './AppText';
import CachedImage from './CachedImage';
import RtlHorizontalScrollView from './RtlHorizontalScrollView';
import RtlHorizontalDraggableFlatList from './RtlHorizontalDraggableFlatList';
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

export function isTravelMediaSwipe({ translationX = 0, translationY = 0, velocityX = 0 } = {}) {
  'worklet';
  const horizontalDistance = Math.abs(translationX);
  return horizontalDistance >= TRAVEL_MEDIA_SWIPE_DISTANCE
    && Math.abs(velocityX) >= TRAVEL_MEDIA_SWIPE_VELOCITY
    && horizontalDistance >= Math.abs(translationY) * TRAVEL_MEDIA_SWIPE_DOMINANCE;
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

function CropPage({ item, aspect, onCropChange, onSwipe, cropEnabled = true }) {
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
  }), [ratio, stageSize]);
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
    .enabled(Boolean(uri))
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
      if (isTravelMediaSwipe(event)) {
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
      canCrop, commitCrop, displayHeight, displayWidth, isAdjusting, onSwipe, startX, startY,
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
          <MediaImage uri={uri} style={styles.uncroppedImage} contentFit="contain" />
          <AppText style={styles.existingHint}>תמונה שכבר פורסמה נשארת ללא שינוי</AppText>
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
  return <View style={styles.badge}><AppText style={styles.badgeText}>{number}</AppText></View>;
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
  const [working, setWorking] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [composerError, setComposerError] = useState('');
  const [composerSession, setComposerSession] = useState(0);
  const [cropEditing, setCropEditing] = useState(false);
  const reorderInteractionActiveRef = useRef(false);
  const reorderInteractionCallbackRef = useRef(onReorderInteractionChange);
  reorderInteractionCallbackRef.current = onReorderInteractionChange;
  const ratio = (Number(aspect?.[0]) || 1) / (Number(aspect?.[1]) || 1);
  const options = useMemo(() => ({ aspect, maxItems, maxLongEdge, compress }), [
    aspect, compress, maxItems, maxLongEdge,
  ]);

  useEffect(() => {
    if (!visible) return;
    setWorking(mergeTravelMediaSelection([], value, options));
    setActiveIndex(0);
    setComposerError('');
    setCropEditing(false);
    setComposerSession((current) => current + 1);
    sourceAdapter.kind === 'inline-library' && sourceAdapter.loadInitial().catch(() => {});
  }, [visible]); // The draft is intentionally captured only when the composer opens.

  useEffect(() => {
    if (!embedded || !visible) return;
    setWorking(mergeTravelMediaSelection([], value, options));
  }, [embedded, options, value, visible]);

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, Math.max(0, working.length - 1))));
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

  const commitReorder = useCallback((next) => {
    const activeIdentity = travelMediaIdentity(working[activeIndex]);
    setWorking(next);
    setActiveIndex(Math.max(0, next.findIndex((item) => travelMediaIdentity(item) === activeIdentity)));
    if (embedded) onChange?.(next);
  }, [activeIndex, embedded, onChange, working]);

  const setReorderInteractionActive = useCallback((active) => {
    const nextActive = Boolean(active);
    if (reorderInteractionActiveRef.current === nextActive) return;
    reorderInteractionActiveRef.current = nextActive;
    reorderInteractionCallbackRef.current?.(nextActive);
  }, []);

  const beginReorder = useCallback((index) => {
    setActiveIndex(index);
    setReorderInteractionActive(true);
  }, [setReorderInteractionActive]);

  const releaseReorder = useCallback(() => {
    setReorderInteractionActive(false);
  }, [setReorderInteractionActive]);

  const finishReorder = useCallback(({ data }) => {
    try {
      commitReorder(data);
    } finally {
      setReorderInteractionActive(false);
    }
  }, [commitReorder, setReorderInteractionActive]);

  useEffect(() => () => {
    if (!reorderInteractionActiveRef.current) return;
    reorderInteractionActiveRef.current = false;
    reorderInteractionCallbackRef.current?.(false);
  }, []);

  useEffect(() => {
    if (!visible) setReorderInteractionActive(false);
  }, [setReorderInteractionActive, visible]);

  const moveForAccessibility = useCallback((fromIndex, toIndex) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= working.length || toIndex >= working.length) return;
    const next = [...working];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    commitReorder(next);
  }, [commitReorder, working]);

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
            <View style={[styles.previewWrap, styles.embeddedPreview, { aspectRatio: ratio }]}>
              <CropPage
                key={`${composerSession}:${travelMediaIdentity(activeItem)}`}
                item={activeItem}
                aspect={aspect}
                cropEnabled={cropEditing}
                onCropChange={(crop) => updateCrop(travelMediaIdentity(activeItem), crop)}
                onSwipe={navigateBySwipe}
              />
              <View style={styles.previewTools} pointerEvents="box-none">
                <View style={styles.activeBadge} pointerEvents="none">
                  <AppText style={styles.activeBadgeText}>{activeIndex + 1}/{working.length}</AppText>
                </View>
              </View>
              <AppText style={styles.cropHint}>
                {cropEditing && activeItem?.transform
                  ? 'גרירה וצביטה מתאימות את החיתוך · החלקה מהירה עוברת תמונה'
                  : 'החליקו ימינה או שמאלה כדי לעבור בין התמונות'}
              </AppText>
            </View>
            <View style={styles.embeddedActions}>
              <Pressable
                style={[styles.embeddedAction, cropEditing && styles.embeddedActionActive]}
                onPress={() => setCropEditing((current) => !current)}
                disabled={!activeItem?.transform}
                testID="travel-media-toggle-crop"
              >
                <Ionicons name="crop-outline" size={20} color={colors.primary} />
                <AppText style={styles.embeddedActionText}>{cropEditing ? 'סיום חיתוך' : 'חיתוך'}</AppText>
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
            <RtlHorizontalDraggableFlatList
              data={working}
              keyExtractor={travelMediaIdentity}
              activationDistance={8}
              dragItemOverflow
              autoscrollThreshold={32}
              autoscrollSpeed={80}
              onDragBegin={beginReorder}
              onRelease={releaseReorder}
              onDragEnd={finishReorder}
              renderPlaceholder={({ index }) => (
                <View
                  style={[styles.embeddedThumb, styles.embeddedPlaceholder]}
                  testID={`travel-media-placeholder-${index}`}
                />
              )}
              containerStyle={styles.embeddedStripContainer}
              contentContainerStyle={styles.embeddedStrip}
              style={styles.embeddedStripList}
              testID="travel-media-reorder-list"
              renderItem={({ item, getIndex, drag, isActive }) => {
                const reportedIndex = getIndex?.();
                const index = Number.isInteger(reportedIndex)
                  ? reportedIndex
                  : working.findIndex((entry) => travelMediaIdentity(entry) === travelMediaIdentity(item));
                const selected = index === activeIndex;
                const identity = travelMediaIdentity(item);
                return (
                  <ScaleDecorator activeScale={1.1}>
                    <ShadowDecorator elevation={12} radius={8} opacity={0.28}>
                      <Pressable
                        style={[
                          styles.selectedThumb,
                          styles.embeddedThumb,
                          selected && styles.selectedThumbActive,
                          isActive && styles.embeddedThumbDragging,
                        ]}
                        onPress={() => setActiveIndex(index)}
                        onLongPress={drag}
                        delayLongPress={180}
                        disabled={isActive}
                        accessibilityRole="button"
                        accessibilityLabel={`תמונה ${index + 1}; לחיצה ארוכה וגרירה לשינוי סדר`}
                        accessibilityState={{ selected }}
                        accessibilityActions={[
                          ...(index > 0 ? [{ name: 'moveUp', label: 'העברה אחורה' }] : []),
                          ...(index < working.length - 1 ? [{ name: 'moveDown', label: 'העברה קדימה' }] : []),
                        ]}
                        onAccessibilityAction={({ nativeEvent }) => {
                          if (nativeEvent.actionName === 'moveUp') moveForAccessibility(index, index - 1);
                          if (nativeEvent.actionName === 'moveDown') moveForAccessibility(index, index + 1);
                        }}
                        testID={`travel-media-selected-${identity}`}
                      >
                        <MediaImage uri={travelMediaUri(item)} style={styles.selectedThumbImage} contentFit="cover" />
                        <SelectionBadge number={index + 1} />
                      </Pressable>
                    </ShadowDecorator>
                  </ScaleDecorator>
                );
              }}
            />
          </>
        )}
        {pending ? <ActivityIndicator style={styles.embeddedStatus} color={colors.primary} /> : null}
        {(composerError || sourceAdapter.error) ? (
          <View style={styles.errorRow} testID="travel-media-error">
            <AppText style={styles.errorText}>{composerError || sourceAdapter.error}</AppText>
            {failed ? <Pressable onPress={retryFailed}><AppText style={styles.retryText}>ניסיון נוסף</AppText></Pressable> : null}
          </View>
        ) : null}
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
            <CropPage
              key={`${composerSession}:${travelMediaIdentity(working[activeIndex])}`}
              item={working[activeIndex]}
              aspect={aspect}
              onCropChange={(crop) => updateCrop(travelMediaIdentity(working[activeIndex]), crop)}
              onSwipe={navigateBySwipe}
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
  embeddedPreview: { borderRadius: spacing.radiusLarge },
  embeddedActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  embeddedAction: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: spacing.radiusFull, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  embeddedActionActive: { borderColor: colors.primary, backgroundColor: colors.accentLight },
  embeddedActionText: { color: colors.primary, fontSize: 13 },
  embeddedDeleteText: { color: colors.error },
  embeddedReorderHint: { color: colors.textSecondary, fontSize: 12, textAlign: 'right', writingDirection: 'rtl', marginTop: spacing.md, marginBottom: spacing.xs },
  embeddedStripList: { height: 96, overflow: 'visible' },
  embeddedStripContainer: { overflow: 'visible' },
  embeddedStrip: { gap: spacing.sm, paddingVertical: 10 },
  embeddedThumb: { width: 76, height: 76 },
  embeddedThumbDragging: { borderColor: colors.primary, borderWidth: 3, backgroundColor: colors.accentLight },
  embeddedPlaceholder: { borderRadius: spacing.radiusSmall, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.accentLight },
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
  activeBadgeText: { color: colors.white, fontSize: 12 },
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
  badgeText: { color: colors.white, fontSize: 12 },
  tileLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  gridLoader: { marginVertical: spacing.lg },
});
