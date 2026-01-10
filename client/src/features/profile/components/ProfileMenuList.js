import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { cards, typography, colors } from '../../../styles';

export default function ProfileMenuList({ items, onPressItem, notificationBadge }) {
  return (
    <View style={cards.profileMenu}>
      {items.map((item, index) => {
        // Show badge only for Notifications item
        const showBadge = item.key === 'notifications' && notificationBadge > 0;
        
        return (
          <TouchableOpacity
            key={item.key || item.label || index}
            style={cards.profileMenuItem}
            onPress={() => onPressItem?.(item.key ?? item.label)}
            activeOpacity={0.85}
          >
            <View style={cards.profileMenuItemLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name={item.icon} size={22} color={colors.textSecondary} />
                {showBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {notificationBadge > 99 ? '99+' : notificationBadge}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={typography.profileMenuItemText}>{item.label}</Text>
            </View>

            <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
