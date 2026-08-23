import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';

import AppText from './AppText';
import CachedImage from './CachedImage';
import { getImageSize } from '../hooks/useImagePicker';
import { colors, imageCropReviewStyles as styles, spacing } from '../styles';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const MAX_CROP_VIEWPORT_WIDTH = 640;
const ZERO_SAFE_AREA_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export function boundCropTranslation({
  displayWidth = 0,
  displayHeight = 0,
  viewportWidth = 0,
  viewportHeight = 0,
  zoom = 1,
  translateX = 0,
  translateY = 0,
}) {
  'worklet';
  const maximumX = Math.max(0, ((displayWidth || 0) * zoom - (viewportWidth || 0)) / 2);
  const maximumY = Math.max(0, ((displayHeight || 0) * zoom - (viewportHeight || 0)) / 2);
  return {
    x: Math.max(-maximumX, Math.min(maximumX, translateX)),
    y: Math.max(-maximumY, Math.min(maximumY, translateY)),
  };
}

export function fitCropViewport({ containerWidth, containerHeight, aspectRatio }) {
  const width = Math.min(MAX_CROP_VIEWPORT_WIDTH, Math.max(0, Number(containerWidth) || 0));
  const height = Math.max(0, Number(containerHeight) || 0);
  const ratio = Math.max(0.01, Number(aspectRatio) || 1);
  if (!width || !height) return null;
  const fittedWidth = Math.min(width, height * ratio);
  return {
    width: fittedWidth,
    height: fittedWidth / ratio,
  };
}

export function calculateCropRect({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
  zoom = 1,
  translateX = 0,
  translateY = 0,
}) {
  const baseScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const appliedScale = baseScale * Math.max(1, zoom);
  const displayedWidth = sourceWidth * appliedScale;
  const displayedHeight = sourceHeight * appliedScale;
  const maximumX = Math.max(0, (displayedWidth - viewportWidth) / 2);
  const maximumY = Math.max(0, (displayedHeight - viewportHeight) / 2);
  const boundedX = clamp(translateX, -maximumX, maximumX);
  const boundedY = clamp(translateY, -maximumY, maximumY);
  const width = Math.min(sourceWidth, viewportWidth / appliedScale);
  const height = Math.min(sourceHeight, viewportHeight / appliedScale);
  const originX = clamp(
    (displayedWidth - viewportWidth) / (2 * appliedScale) - boundedX / appliedScale,
    0,
    sourceWidth - width
  );
  const originY = clamp(
    (displayedHeight - viewportHeight) / (2 * appliedScale) - boundedY / appliedScale,
    0,
    sourceHeight - height
  );
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export async function cropImageForReview(uri, crop, { maxLongEdge, compress = 0.94 } = {}) {
  const cropLongEdge = Math.max(crop.width, crop.height);
  const outputLongEdge = Math.min(cropLongEdge, Math.max(1, Number(maxLongEdge) || cropLongEdge));
  const scale = outputLongEdge / cropLongEdge;
  const actions = [{ crop }];
  if (scale < 1) {
    actions.push({
      resize: {
        width: Math.max(1, Math.round(crop.width * scale)),
        height: Math.max(1, Math.round(crop.height * scale)),
      },
    });
  }
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result?.uri || uri;
}

export default function ImageCropReviewModal({
  visible,
  uris = [],
  aspect = [1, 1],
  maxLongEdge = 1600,
  compress = 0.94,
  onCancel,
  onComplete,
}) {
  const insets = useContext(SafeAreaInsetsContext) || ZERO_SAFE_AREA_INSETS;
  const [index, setIndex] = useState(0);
  const [sourceSize, setSourceSize] = useState(null);
  const [stageSize, setStageSize] = useState(null);
  const [viewport, setViewport] = useState(null);
  const [processed, setProcessed] = useState([]);
  const [saving, setSaving] = useState(false);
  const zoom = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const displayWidth = useSharedValue(0);
  const displayHeight = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const uri = uris[index] || null;
  const ratio = (Number(aspect?.[0]) || 1) / (Number(aspect?.[1]) || 1);
  const fittedViewport = useMemo(() => fitCropViewport({
    containerWidth: stageSize?.width,
    containerHeight: stageSize?.height,
    aspectRatio: ratio,
  }), [ratio, stageSize]);

  useEffect(() => {
    if (!visible) return;
    setIndex(0);
    setProcessed([]);
    setSaving(false);
  }, [visible, uris]);

  useEffect(() => {
    let active = true;
    setSourceSize(null);
    zoom.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    if (uri) getImageSize(uri).then((size) => {
      if (active) setSourceSize(size);
    }).catch(() => {
      if (active) setSourceSize(null);
    });
    return () => { active = false; };
  }, [translateX, translateY, uri, zoom]);

  const displaySize = useMemo(() => {
    if (!sourceSize || !viewport) return null;
    const baseScale = Math.max(
      viewport.width / sourceSize.width,
      viewport.height / sourceSize.height
    );
    return {
      width: sourceSize.width * baseScale,
      height: sourceSize.height * baseScale,
    };
  }, [sourceSize, viewport]);

  useEffect(() => {
    displayWidth.value = displaySize?.width || 0;
    displayHeight.value = displaySize?.height || 0;
    viewportWidth.value = viewport?.width || 0;
    viewportHeight.value = viewport?.height || 0;
  }, [displayHeight, displaySize, displayWidth, viewport, viewportHeight, viewportWidth]);

  const pan = Gesture.Pan()
    .minDistance(1)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
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
    });
  const pinch = Gesture.Pinch()
    .onStart(() => { startZoom.value = zoom.value; })
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
      zoom.value = withTiming(Math.max(1, Math.min(4, zoom.value)));
    });
  const gesture = Gesture.Simultaneous(pan, pinch);
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: zoom.value },
    ],
  }));

  const confirmCurrent = async () => {
    if (!uri || !sourceSize || !viewport || saving) return;
    setSaving(true);
    try {
      const crop = calculateCropRect({
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        zoom: zoom.value,
        translateX: translateX.value,
        translateY: translateY.value,
      });
      const cropped = await cropImageForReview(uri, crop, { maxLongEdge, compress });
      const next = [...processed, cropped];
      if (index >= uris.length - 1) {
        await onComplete?.(next);
      } else {
        setProcessed(next);
        setIndex((current) => current + 1);
      }
    } catch (error) {
      console.error('Could not crop image:', error);
      Alert.alert('לא הצלחנו להכין את התמונה', 'אפשר לנסות שוב או לבחור תמונה אחרת.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={styles.screen}>
      <View
        style={[
          styles.screen,
          { paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) },
        ]}
        testID="image-crop-safe-area"
      >
        <View style={styles.header} testID="image-crop-header">
          <Pressable
            onPress={onCancel}
            disabled={saving}
            style={[styles.headerAction, styles.headerActionSecondary, saving && styles.headerActionDisabled]}
            testID="image-crop-cancel"
          >
            <AppText style={styles.cancelText}>ביטול</AppText>
          </Pressable>
          <View style={styles.headerCopy}>
            <AppText style={styles.title}>התאמת התמונה</AppText>
            <AppText style={styles.counter}>{index + 1}/{uris.length}</AppText>
          </View>
          <Pressable
            onPress={confirmCurrent}
            disabled={saving || !displaySize}
            style={[
              styles.headerAction,
              styles.headerActionPrimary,
              (saving || !displaySize) && styles.headerActionDisabled,
            ]}
            testID="image-crop-confirm"
          >
            <AppText style={styles.confirmText}>{index === uris.length - 1 ? 'סיום' : 'הבא'}</AppText>
          </Pressable>
        </View>

        <View
          style={styles.stage}
          onLayout={(event) => {
            const layout = event.nativeEvent.layout;
            setStageSize({
              width: Math.max(0, layout.width - (2 * spacing.md)),
              height: Math.max(0, layout.height - (2 * spacing.sm)),
            });
          }}
          testID="image-crop-stage"
        >
          {fittedViewport ? <View
            style={[styles.viewport, fittedViewport]}
            onLayout={(event) => setViewport(event.nativeEvent.layout)}
            testID="image-crop-viewport"
          >
            {displaySize && uri ? (
              <GestureDetector gesture={gesture}>
                <Animated.View style={styles.gestureSurface} collapsable={false}>
                  <Animated.View
                    style={[
                      styles.imageWrap,
                      {
                        width: displaySize.width,
                        height: displaySize.height,
                        left: (viewport.width - displaySize.width) / 2,
                        top: (viewport.height - displaySize.height) / 2,
                      },
                      animatedImageStyle,
                    ]}
                  >
                    <CachedImage
                      source={{ uri }}
                      style={styles.image}
                      contentFit="fill"
                      pointerEvents="none"
                    />
                  </Animated.View>
                </Animated.View>
              </GestureDetector>
            ) : (
              <ActivityIndicator size="large" color={colors.white} />
            )}
          </View> : null}
        </View>

        <View style={styles.footer}>
          <AppText style={styles.helper}>צבטו להגדלה וגררו כדי לבחור את החיתוך</AppText>
          {saving ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
