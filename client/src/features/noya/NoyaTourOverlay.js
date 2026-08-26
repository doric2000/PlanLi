import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import AppText from '../../components/AppText';
import { fontFamilies } from '../../styles/typography';
import { NOYA_TOUR_IDS, useNoyaTour } from './NoyaTourContext';

const BUBBLE_GAP = 14;
const BUBBLE_ESTIMATED_HEIGHT = 286;
const MEASUREMENT_RETRY_MS = 80;
const MEASUREMENT_STABILITY_DELTA = 1;

function finiteRect(rect) {
  if (!rect) return null;
  const values = [rect.x, rect.y, rect.width, rect.height].map(Number);
  if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

export function rectInOverlay(targetRect, overlayWindowRect, overlayLayoutRect) {
  const target = finiteRect(targetRect);
  const overlayWindow = finiteRect(overlayWindowRect);
  const overlayLayout = finiteRect(overlayLayoutRect);
  if (!target || !overlayWindow || !overlayLayout) return null;
  const scaleX = overlayLayout.width / overlayWindow.width;
  const scaleY = overlayLayout.height / overlayWindow.height;
  if (![scaleX, scaleY].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) return null;
  return {
    x: (target.x - overlayWindow.x) * scaleX,
    y: (target.y - overlayWindow.y) * scaleY,
    width: target.width * scaleX,
    height: target.height * scaleY,
  };
}

export function safeInsetsInOverlay({
  insets,
  overlayLayoutRect,
  overlayWindowRect,
  windowHeight,
  windowWidth,
}) {
  const overlayWindow = finiteRect(overlayWindowRect);
  const overlayLayout = finiteRect(overlayLayoutRect);
  if (!overlayWindow || !overlayLayout) return insets;
  const scaleX = overlayLayout.width / overlayWindow.width;
  const scaleY = overlayLayout.height / overlayWindow.height;
  const safeLeft = Math.max(0, Number(insets?.left) || 0);
  const safeTop = Math.max(0, Number(insets?.top) || 0);
  const safeRight = Math.max(safeLeft, windowWidth - Math.max(0, Number(insets?.right) || 0));
  const safeBottom = Math.max(safeTop, windowHeight - Math.max(0, Number(insets?.bottom) || 0));
  const overlayRight = overlayWindow.x + overlayWindow.width;
  const overlayBottom = overlayWindow.y + overlayWindow.height;
  return {
    left: Math.max(0, Math.min(overlayLayout.width, (safeLeft - overlayWindow.x) * scaleX)),
    top: Math.max(0, Math.min(overlayLayout.height, (safeTop - overlayWindow.y) * scaleY)),
    right: Math.max(0, Math.min(overlayLayout.width, (overlayRight - safeRight) * scaleX)),
    bottom: Math.max(0, Math.min(overlayLayout.height, (overlayBottom - safeBottom) * scaleY)),
  };
}

export function spotlightForTarget(rect, width, height, options = {}) {
  if (!rect) return null;
  const padding = Math.max(0, Number(options.padding) || 0);
  const left = Math.max(0, rect.x - padding);
  const top = Math.max(0, rect.y - padding);
  const right = Math.min(width, rect.x + rect.width + padding);
  const bottom = Math.min(height, rect.y + rect.height + padding);
  if (right <= left || bottom <= top) return null;
  return {
    id: options.id || '',
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    radius: Math.max(0, Number(options.radius) || 0),
  };
}

export function bubbleTopForTarget({
  bubbleHeight = BUBBLE_ESTIMATED_HEIGHT,
  height,
  insets,
  target,
}) {
  const safeTop = Math.max(insets.top + 12, 18);
  const safeBottom = Math.max(insets.bottom + 12, 18);
  const availableHeight = Math.max(160, height - safeTop - safeBottom);
  const measuredBubbleHeight = Math.min(Math.max(160, bubbleHeight), availableHeight);
  const centered = Math.max(
    safeTop,
    Math.min(height - safeBottom - measuredBubbleHeight, (height - measuredBubbleHeight) / 2),
  );
  if (!target) return centered;
  const below = target.y + target.height + BUBBLE_GAP;
  if (below + measuredBubbleHeight <= height - safeBottom) return below;
  const above = target.y - BUBBLE_GAP - measuredBubbleHeight;
  if (above >= safeTop) return above;
  return centered;
}

function rectsAreStable(previous, next) {
  if (!previous || previous.length !== next.length) return false;
  return previous.every((rect, index) => {
    const candidate = next[index];
    return ['x', 'y', 'width', 'height'].every((field) => (
      Math.abs(rect[field] - candidate[field]) <= MEASUREMENT_STABILITY_DELTA
    ));
  });
}

function measureNodeInWindow(node, testID) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const commit = (x, y, width, height) => {
      const values = [x, y, width, height].map(Number);
      if (values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
        finish({ x: values[0], y: values[1], width: values[2], height: values[3] });
      } else {
        finish(null);
      }
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const element = typeof node?.getBoundingClientRect === 'function'
        ? node
        : document.querySelector(`[data-testid="${testID}"]`);
      const rect = element?.getBoundingClientRect?.();
      if (rect) {
        commit(rect.x, rect.y, rect.width, rect.height);
        return;
      }
    }
    if (node?.measureInWindow) {
      node.measureInWindow(commit);
      return;
    }
    finish(null);
  });
}

function descriptorsForStep(activeStep, activeDefinition) {
  if (Array.isArray(activeDefinition?.targets)) return activeDefinition.targets;
  const targetId = activeStep?.targetId || activeDefinition?.targetId;
  return targetId ? [{ id: targetId, padding: 3, radius: 16, anchor: true }] : [];
}

export default function NoyaTourOverlayHost({ measureOverlayRect, scope = 'root' }) {
  const {
    acknowledgeCreatorStep,
    activeDefinition,
    activeStep,
    advanceMainTour,
    backMainTour,
    dismissActiveTour,
    getTargetNode,
    isSuspended,
    runActiveCreatorAction,
    targetRevision,
  } = useNoyaTour();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const overlayRef = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const [bubbleHeight, setBubbleHeight] = useState(BUBBLE_ESTIMATED_HEIGHT);
  const [overlayLayout, setOverlayLayout] = useState(null);
  const [overlayMetrics, setOverlayMetrics] = useState(null);
  const [measuredTargets, setMeasuredTargets] = useState([]);
  const [targetsMeasured, setTargetsMeasured] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const visible = Boolean(activeStep && activeDefinition && activeStep.scope === scope && !isSuspended);
  const targetDescriptors = useMemo(
    () => descriptorsForStep(activeStep, activeDefinition),
    [activeDefinition, activeStep],
  );
  const targetsKey = targetDescriptors.map((target) => (
    `${target.id}:${target.padding || 0}:${target.radius || 0}:${target.anchor ? 1 : 0}`
  )).join('|');

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(8);
      setOverlayLayout(null);
      setOverlayMetrics(null);
      setMeasuredTargets([]);
      setTargetsMeasured(false);
      return undefined;
    }

    setOverlayMetrics(null);
    setMeasuredTargets([]);
    setTargetsMeasured(false);
    let cancelled = false;
    let timer = null;
    let previousRects = null;

    const measure = async () => {
      const overlayWindowRect = finiteRect(
        typeof measureOverlayRect === 'function'
          ? await measureOverlayRect()
          : await measureNodeInWindow(
            overlayRef.current,
            `noya-tour-overlay-${scope}`,
          ),
      );
      const rawRects = await Promise.all(targetDescriptors.map((target) => (
        measureNodeInWindow(
          getTargetNode(target.id, scope),
          `noya-tour-target-${target.id}`,
        )
      )));
      if (cancelled) return;
      const layoutRect = finiteRect({
        x: 0,
        y: 0,
        width: overlayLayout?.width || overlayWindowRect?.width,
        height: overlayLayout?.height || overlayWindowRect?.height,
      });
      const localRects = rawRects.map((rect) => (
        rectInOverlay(rect, overlayWindowRect, layoutRect)
      ));
      const spotlights = localRects.map((rect, index) => (
        spotlightForTarget(rect, layoutRect?.width, layoutRect?.height, targetDescriptors[index])
      ));
      const complete = Boolean(
        overlayWindowRect
        && layoutRect
        && rawRects.every(Boolean)
        && localRects.every(Boolean)
        && spotlights.every(Boolean),
      );
      const nextRects = complete
        ? [overlayWindowRect, layoutRect, ...rawRects]
        : null;
      if (complete) {
        if (rectsAreStable(previousRects, nextRects)) {
          setOverlayMetrics({ layoutRect, windowRect: overlayWindowRect });
          setMeasuredTargets(spotlights);
          setTargetsMeasured(true);
          return;
        }
        previousRects = nextRects;
      } else {
        previousRects = null;
      }
      timer = setTimeout(measure, MEASUREMENT_RETRY_MS);
    };

    measure();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    getTargetNode,
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    measureOverlayRect,
    overlayLayout?.height,
    overlayLayout?.width,
    opacity,
    scope,
    targetDescriptors,
    targetRevision,
    targetsKey,
    translateY,
    visible,
    windowHeight,
    windowWidth,
  ]);

  const renderReady = visible && Boolean(overlayMetrics) && targetsMeasured;

  useEffect(() => {
    if (!renderReady) return;
    AccessibilityInfo.announceForAccessibility?.(`${activeDefinition.title}. ${activeDefinition.message}`);
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [activeDefinition, activeStep, opacity, reduceMotion, renderReady, translateY]);

  const anchorTargetId = activeDefinition?.anchorTargetId
    || targetDescriptors.find((target) => target.anchor)?.id
    || targetDescriptors[0]?.id;
  const anchorSpotlight = measuredTargets.find((target) => target.id === anchorTargetId)
    || measuredTargets[0]
    || null;
  const surfaceWidth = overlayMetrics?.layoutRect.width || overlayLayout?.width || windowWidth;
  const surfaceHeight = overlayMetrics?.layoutRect.height || overlayLayout?.height || windowHeight;
  const localInsets = overlayMetrics
    ? safeInsetsInOverlay({
      insets,
      overlayLayoutRect: overlayMetrics.layoutRect,
      overlayWindowRect: overlayMetrics.windowRect,
      windowHeight,
      windowWidth,
    })
    : insets;
  const bubbleTop = bubbleTopForTarget({
    bubbleHeight,
    height: surfaceHeight,
    insets: localInsets,
    target: anchorSpotlight,
  });
  const safeBottom = Math.max(localInsets.bottom + 12, 18);
  const bubbleMaxHeight = Math.max(160, surfaceHeight - bubbleTop - safeBottom);

  if (!visible) return null;

  const isMain = activeStep.tourId === NOYA_TOUR_IDS.main;
  const canGoBack = isMain && activeStep.stepIndex > 0;
  const hasCreatorAction = !isMain && typeof activeStep.primaryAction === 'function';
  const primaryLabel = activeStep.primaryLabel
    || activeDefinition.primaryLabel
    || (isMain ? 'הבא' : 'הבנתי');
  const onPrimary = isMain
    ? advanceMainTour
    : hasCreatorAction
      ? runActiveCreatorAction
      : acknowledgeCreatorStep;

  return (
    <View
      accessibilityElementsHidden={!renderReady}
      accessibilityViewIsModal={renderReady}
      importantForAccessibility={renderReady ? 'yes' : 'no-hide-descendants'}
      onLayout={(event) => {
        const nextWidth = Number(event.nativeEvent.layout.width || 0);
        const nextHeight = Number(event.nativeEvent.layout.height || 0);
        if (nextWidth <= 0 || nextHeight <= 0) return;
        setOverlayLayout((current) => (
          current
          && Math.abs(current.width - nextWidth) <= MEASUREMENT_STABILITY_DELTA
          && Math.abs(current.height - nextHeight) <= MEASUREMENT_STABILITY_DELTA
            ? current
            : { width: nextWidth, height: nextHeight }
        ));
      }}
      pointerEvents={renderReady ? 'auto' : 'none'}
      ref={overlayRef}
      style={[StyleSheet.absoluteFill, styles.overlay]}
      testID={`noya-tour-overlay-${scope}`}
    >
      {renderReady ? <>
      <Svg height={surfaceHeight} pointerEvents="none" style={StyleSheet.absoluteFill} width={surfaceWidth}>
        <Defs>
          <Mask id={`noya-spotlight-mask-${scope}`}>
            <Rect fill="#FFFFFF" height={surfaceHeight} width={surfaceWidth} x={0} y={0} />
            {measuredTargets.map((target) => (
              <Rect
                fill="#000000"
                height={target.height}
                key={`mask-${target.id}`}
                rx={target.radius}
                width={target.width}
                x={target.x}
                y={target.y}
              />
            ))}
          </Mask>
        </Defs>
        <Rect
          fill="rgba(10, 31, 55, 0.88)"
          height={surfaceHeight}
          mask={`url(#noya-spotlight-mask-${scope})`}
          width={surfaceWidth}
          x={0}
          y={0}
        />
        {measuredTargets.map((target) => (
          <Rect
            fill="transparent"
            height={target.height}
            key={`outline-${target.id}`}
            rx={target.radius}
            stroke="#F5961D"
            strokeWidth={3}
            width={target.width}
            x={target.x}
            y={target.y}
          />
        ))}
      </Svg>

      <Animated.View
        accessibilityLabel={`${activeDefinition.title}. ${activeDefinition.message}`}
        style={[
          styles.bubble,
          {
            maxHeight: bubbleMaxHeight,
            opacity,
            top: bubbleTop,
            transform: [{ translateY }],
            width: Math.min(
              surfaceWidth - localInsets.left - localInsets.right - 32,
              410,
            ),
          },
        ]}
        onLayout={(event) => {
          const nextHeight = Number(event.nativeEvent.layout.height || 0);
          if (nextHeight > 0 && Math.abs(nextHeight - bubbleHeight) > 1) {
            setBubbleHeight(nextHeight);
          }
        }}
        testID="noya-tour-bubble"
      >
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.bubbleContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.noyaRow}>
            <Image
              accessibilityIgnoresInvertColors
              accessible={false}
              resizeMode="cover"
              source={require('../../../assets/noya-assistant.png')}
              style={styles.noyaImage}
            />
            <View style={styles.copy}>
              <AppText style={styles.title}>{activeDefinition.title}</AppText>
              {activeDefinition.progress ? (
                <AppText style={styles.progress} testID="noya-tour-progress">
                  {`${activeDefinition.progress.current} מתוך ${activeDefinition.progress.total}`}
                </AppText>
              ) : null}
            </View>
          </View>
          <AppText style={styles.message}>{activeDefinition.message}</AppText>
          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={onPrimary}
              style={styles.primaryButton}
              testID="noya-tour-next"
            >
              <AppText style={styles.primaryText}>{primaryLabel}</AppText>
            </TouchableOpacity>
            {canGoBack || hasCreatorAction ? (
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.78}
                onPress={canGoBack ? backMainTour : acknowledgeCreatorStep}
                style={styles.secondaryButton}
                testID="noya-tour-back"
              >
                <AppText style={styles.secondaryText}>{canGoBack ? 'חזרה' : 'הבנתי'}</AppText>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.75}
            onPress={dismissActiveTour}
            style={styles.skipButton}
            testID="noya-tour-skip"
          >
            <AppText style={styles.skipText}>{isMain ? 'דילוג על הסיור' : 'דילוג על ההדרכה'}</AppText>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    elevation: 100,
    zIndex: 999,
  },
  bubble: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(30, 58, 95, 0.10)',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 18,
    position: 'absolute',
    shadowColor: '#071B31',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
  },
  bubbleContent: {
    padding: 18,
  },
  noyaRow: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 12,
  },
  noyaImage: {
    borderColor: '#F5961D',
    borderRadius: 31,
    borderWidth: 2,
    height: 62,
    width: 62,
  },
  copy: {
    alignItems: 'flex-end',
    flex: 1,
  },
  title: {
    color: '#1E3A5F',
    fontFamily: fontFamilies.semiBold,
    fontSize: 19,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  progress: {
    color: '#A35E00',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  message: {
    color: '#26384D',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1E3A5F',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#D8DEE8',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 84,
    paddingHorizontal: 14,
  },
  secondaryText: {
    color: '#1E3A5F',
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingTop: 8,
  },
  skipText: {
    color: '#667085',
    fontSize: 14,
    textAlign: 'center',
    textDecorationLine: 'underline',
    writingDirection: 'rtl',
  },
});
