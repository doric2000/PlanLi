import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buttons, colors } from '../styles';


export default function FilterIconButton({ active = false, onPress, style, floating = true }) {
  
  // Logic: 
  // If floating is TRUE (default), use the legacy/floating style.
  // If floating is FALSE, use the new Base style (no absolute position).
  const baseStyle = floating ? buttons.filterIcon : buttons.filterIconBase;

  return (
    <TouchableOpacity
      style={[baseStyle, style]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Open filters"
    >
      <Ionicons
        name="filter"
        size={30}
        color={active ? colors.primary : colors.textPrimary}
      />
    </TouchableOpacity>
  );
}