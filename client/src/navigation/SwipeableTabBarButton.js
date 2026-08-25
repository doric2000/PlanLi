import React, { useCallback } from 'react';
import { View } from 'react-native';
import { PlatformPressable } from '@react-navigation/elements';

import { tabNavigatorStyles as styles } from '../styles';
import { useNoyaTourTargetRegistration } from '../features/noya/NoyaTourContext';
import { useHorizontalSwipeResponder } from './horizontalSwipe';

export default function SwipeableTabBarButton({ onSwipe, style, tourTargetId, ...buttonProps }) {
  const tourTarget = useNoyaTourTargetRegistration(tourTargetId);
  const handleRelease = useCallback((gestureState) => {
    onSwipe?.(gestureState);
  }, [onSwipe]);
  const swipeResponder = useHorizontalSwipeResponder({ onRelease: handleRelease });

  return (
    <View
      collapsable={false}
      onLayout={tourTargetId ? tourTarget.onLayout : undefined}
      ref={tourTargetId ? tourTarget.ref : undefined}
      style={styles.swipeButton}
      {...swipeResponder.panHandlers}
    >
      <PlatformPressable {...buttonProps} style={style} />
    </View>
  );
}
