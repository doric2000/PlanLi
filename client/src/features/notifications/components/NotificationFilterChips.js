import React from 'react';
import { Pressable } from 'react-native';

import AppText from '../../../components/AppText';
import RtlHorizontalScrollView from '../../../components/RtlHorizontalScrollView';
import { notificationCenterStyles as styles } from '../styles/notificationCenterStyles';

export default function NotificationFilterChips({ options, value, onChange }) {
  return (
    <RtlHorizontalScrollView
      bounces={false}
      contentContainerStyle={styles.chipContent}
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
    </RtlHorizontalScrollView>
  );
}
