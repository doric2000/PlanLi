import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView } from 'react-native';

import AppText from '../../../components/AppText';
import { notificationCenterStyles as styles } from '../styles/notificationCenterStyles';

export default function NotificationFilterChips({ options, value, onChange }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ x: 0, animated: false });
  }, [options]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      bounces={false}
      contentContainerStyle={styles.chipContent}
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroller}
      accessibilityRole="tablist"
      testID="notification-filter-chips"
    >
      {options.map((option) => {
        const selected = option.key === value;
        const label = Number.isFinite(option.count) && option.count > 0
          ? `${option.label} ${option.count > 99 ? '99+' : option.count}`
          : option.label;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipActive,
              pressed && styles.rowPressed,
            ]}
            testID={`notification-filter-${option.key}`}
          >
            <AppText style={[styles.chipText, selected && styles.chipTextActive]}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
