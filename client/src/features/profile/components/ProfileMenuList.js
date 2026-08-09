import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons } from '@expo/vector-icons';

import { cards, typography, colors, profileMenuListStyles as styles } from '../../../styles';

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
                    <AppText style={styles.badgeText}>
                      {notificationBadge > 99 ? '99+' : notificationBadge}
                    </AppText>
                  </View>
                )}
              </View>
              <AppText style={typography.profileMenuItemText}>{item.label}</AppText>
            </View>

            <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
