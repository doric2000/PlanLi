import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Platform, ScrollView } from 'react-native';

import { rtlHorizontalStyles as styles } from '../styles';

const RtlHorizontalScrollView = forwardRef(function RtlHorizontalScrollView(
  { contentContainerStyle, onContentSizeChange, ...props },
  forwardedRef
) {
  const scrollRef = useRef(null);

  useImperativeHandle(forwardedRef, () => scrollRef.current);

  const handleContentSizeChange = useCallback((width, height) => {
    onContentSizeChange?.(width, height);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: false }));
  }, [onContentSizeChange]);

  return (
    <ScrollView
      {...props}
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        contentContainerStyle,
        Platform.OS === 'web' ? styles.webContent : styles.nativeContent,
      ]}
      onContentSizeChange={handleContentSizeChange}
      {...(Platform.OS === 'web' ? { dir: 'rtl' } : {})}
    />
  );
});

export default RtlHorizontalScrollView;
