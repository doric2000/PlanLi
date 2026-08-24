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
import { NOYA_TOUR_IDS, useNoyaTour } from './NoyaTourContext';

const TARGET_PADDING = 8;
const BUBBLE_GAP = 14;
const BUBBLE_ESTIMATED_HEIGHT = 286;

function paddedTarget(rect, width, height) {
  if (!rect) return null;
  if (
    rect.x + rect.width <= 0
    || rect.y + rect.height <= 0
    || rect.x >= width
    || rect.y >= height
  ) return null;
  const x = Math.max(8, Math.min(width - 52, rect.x - TARGET_PADDING));
  const y = Math.max(8, Math.min(height - 52, rect.y - TARGET_PADDING));
  return {
    x,
    y,
    width: Math.max(44, Math.min(width - x - 8, rect.width + (TARGET_PADDING * 2))),
    height: Math.max(44, Math.min(height - y - 8, rect.height + (TARGET_PADDING * 2))),
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

export default function NoyaTourOverlayHost({ scope = 'root' }) {
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const [bubbleHeight, setBubbleHeight] = useState(BUBBLE_ESTIMATED_HEIGHT);
  const [targetRect, setTargetRect] = useState(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const visible = Boolean(activeStep && activeDefinition && activeStep.scope === scope && !isSuspended);
  const targetId = activeStep?.targetId || activeDefinition?.targetId || '';

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(8);
      setTargetRect(null);
      return undefined;
    }
    if (!targetId) {
      setTargetRect(null);
      return undefined;
    }
    setTargetRect(null);
    let cancelled = false;
    const timers = [];
    const commitMeasurement = (x, y, measuredWidth, measuredHeight) => {
      if (cancelled) return;
      if ([x, y, measuredWidth, measuredHeight].every(Number.isFinite) && measuredWidth > 0 && measuredHeight > 0) {
        setTargetRect({ x, y, width: measuredWidth, height: measuredHeight });
      }
    };
    const measure = () => {
      const node = getTargetNode(targetId, scope);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const element = document.querySelector(`[data-testid="noya-tour-target-${targetId}"]`);
        const rect = element?.getBoundingClientRect?.();
        if (rect) {
          commitMeasurement(rect.x, rect.y, rect.width, rect.height);
          return;
        }
      }
      if (node?.measureInWindow) {
        node.measureInWindow(commitMeasurement);
        return;
      }
      if (node?.measure) {
        node.measure((_x, _y, measuredWidth, measuredHeight, pageX, pageY) => {
          commitMeasurement(pageX, pageY, measuredWidth, measuredHeight);
        });
        return;
      }
    };
    [0, 80, 180, 360].forEach((delay) => timers.push(setTimeout(measure, delay)));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [getTargetNode, scope, targetId, targetRevision, visible, width, height]);

  useEffect(() => {
    if (!visible) return;
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
  }, [activeDefinition, activeStep, opacity, reduceMotion, translateY, visible]);

  const spotlight = useMemo(() => paddedTarget(targetRect, width, height), [height, targetRect, width]);
  const bubbleTop = bubbleTopForTarget({ bubbleHeight, height, insets, target: spotlight });
  const safeBottom = Math.max(insets.bottom + 12, 18);
  const bubbleMaxHeight = Math.max(160, height - bubbleTop - safeBottom);
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
      accessibilityViewIsModal
      importantForAccessibility="yes"
      pointerEvents="auto"
      style={[StyleSheet.absoluteFill, styles.overlay]}
      testID={`noya-tour-overlay-${scope}`}
    >
      <Svg height={height} pointerEvents="none" style={StyleSheet.absoluteFill} width={width}>
        <Defs>
          <Mask id={`noya-spotlight-mask-${scope}`}>
            <Rect fill="#FFFFFF" height={height} width={width} x={0} y={0} />
            {spotlight ? (
              <Rect
                fill="#000000"
                height={spotlight.height}
                rx={18}
                width={spotlight.width}
                x={spotlight.x}
                y={spotlight.y}
              />
            ) : null}
          </Mask>
        </Defs>
        <Rect
          fill="rgba(10, 31, 55, 0.88)"
          height={height}
          mask={`url(#noya-spotlight-mask-${scope})`}
          width={width}
          x={0}
          y={0}
        />
        {spotlight ? (
          <Rect
            fill="transparent"
            height={spotlight.height}
            rx={18}
            stroke="#F5961D"
            strokeWidth={3}
            width={spotlight.width}
            x={spotlight.x}
            y={spotlight.y}
          />
        ) : null}
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
            width: Math.min(width - 32, 410),
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
    fontSize: 19,
    fontWeight: '800',
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
    fontSize: 16,
    fontWeight: '800',
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
    fontSize: 15,
    fontWeight: '700',
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
