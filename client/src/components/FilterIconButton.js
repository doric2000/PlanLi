import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buttons, colors } from '../styles';

export default function FilterIconButton({ active = false, onPress, style }) {
  return (
    <TouchableOpacity
      style={[buttons.filterIcon, style]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Open filters"
    >
      <Ionicons
        name="options-outline"
        size={24}
        color={active ? colors.primary : colors.textPrimary}
      />
    </TouchableOpacity>
  );
}
