import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { cards, typography, colors } from '../../../styles';

export default function ProfileMenuList({ items, onPressItem }) {
  return (
    <View style={cards.profileMenu}>
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.label || index}
          style={cards.profileMenuItem}
          onPress={() => onPressItem?.(item.label)}
          activeOpacity={0.85}
        >
          <View style={cards.profileMenuItemLeft}>
            <Ionicons name={item.icon} size={22} color={colors.textSecondary} />
            <Text style={typography.profileMenuItemText}>{item.label}</Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
