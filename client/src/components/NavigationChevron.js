import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../styles';

export default function NavigationChevron({ color = colors.textMuted, size = 18, style, ...props }) {
  return (
    <Ionicons
      {...props}
      accessibilityElementsHidden
      importantForAccessibility="no"
      name="chevron-forward"
      size={size}
      color={color}
      style={style}
    />
  );
}
