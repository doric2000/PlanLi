import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons } from '@expo/vector-icons';

import { colors, drawerMenuListStyles as styles } from '../../../styles';

export default function ProfileMenuList({ items, onPressItem, notificationBadge }) {
  return (
    <View style={styles.group} testID="drawer-menu-group">
      {items.map((item, index) => {
        const showBadge = item.key === 'notifications' && notificationBadge > 0;
        const itemKey = item.key || item.label || index;

        return (
          <TouchableOpacity
            accessibilityLabel={item.label}
            accessibilityRole="button"
            key={itemKey}
            style={[styles.row, index === items.length - 1 && styles.rowLast]}
            onPress={() => onPressItem?.(item.key ?? item.label)}
            activeOpacity={0.85}
            testID={`drawer-menu-item-${itemKey}`}
          >
            <View style={styles.iconBubble} testID={`drawer-menu-icon-${itemKey}`}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
            </View>
            <AppText numberOfLines={1} style={styles.label}>{item.label}</AppText>
            {showBadge ? (
              <View accessibilityLabel={`${notificationBadge} התראות חדשות`} style={styles.badge}>
                <AppText style={styles.badgeText}>
                  {notificationBadge > 99 ? '99+' : notificationBadge}
                </AppText>
              </View>
            ) : null}
            <Ionicons
              accessibilityElementsHidden
              color={colors.textMuted}
              importantForAccessibility="no"
              name="chevron-back"
              size={18}
              style={styles.chevron}
              testID={`profile-menu-chevron-${itemKey}`}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
