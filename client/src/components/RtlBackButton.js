import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, detailHeaderStyles as styles } from '../styles';

export default function RtlBackButton({ onPress, testID, accessibilityLabel = 'חזרה' }) {
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.78}
      onPress={onPress}
      style={styles.backButton}
      testID={testID}
    >
      <Ionicons name="arrow-forward" size={21} color={colors.primary} />
    </TouchableOpacity>
  );
}
