import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, useWindowDimensions, View } from 'react-native';
import { tripPlannerStyles as styles } from '../../../styles';

export default function TripPlannerSheet({ children, initialSnap = 'half' }) {
  const { height } = useWindowDimensions();
  const snaps = useMemo(() => ({ full: Math.max(150, height * 0.1), half: height * 0.48, compact: height - 230 }), [height]);
  const start = snaps[initialSnap] || snaps.half;
  const translateY = useRef(new Animated.Value(start)).current;
  const last = useRef(start);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
    onPanResponderGrant: () => translateY.stopAnimation((value) => { last.current = value; }),
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(snaps.full, Math.min(snaps.compact, last.current + gesture.dy))),
    onPanResponderRelease: (_, gesture) => {
      const current = Math.max(snaps.full, Math.min(snaps.compact, last.current + gesture.dy));
      const target = Object.values(snaps).sort((a, b) => Math.abs(a - current) - Math.abs(b - current))[0];
      last.current = target;
      Animated.spring(translateY, { toValue: target, useNativeDriver: true, damping: 22, stiffness: 190 }).start();
    },
  })).current;
  return (
    <Animated.View style={[styles.sheet, { height, transform: [{ translateY }] }]}>
      <View style={styles.sheetHandleArea} {...pan.panHandlers} accessibilityLabel="שינוי גובה רשימת העצירות">
        <View style={styles.sheetHandle} />
      </View>
      <View style={styles.sheetContent}>{children}</View>
    </Animated.View>
  );
}
