import React, { useCallback } from 'react';
import { View } from 'react-native';
import { PlatformPressable } from '@react-navigation/elements';

import { tabNavigatorStyles as styles } from '../styles';
import { useHorizontalSwipeResponder } from './horizontalSwipe';

export default function SwipeableTabBarButton({ onSwipe, style, ...buttonProps }) {
  const handleRelease = useCallback((gestureState) => {
    onSwipe?.(gestureState);
  }, [onSwipe]);
  const swipeResponder = useHorizontalSwipeResponder({ onRelease: handleRelease });

  return (
    <View style={styles.swipeButton} {...swipeResponder.panHandlers}>
      <PlatformPressable {...buttonProps} style={style} />
    </View>
  );
}
