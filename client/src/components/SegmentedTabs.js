import { fontFamilies } from "../styles/typography";
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import AppText from "./AppText";
import { MaterialIcons } from '@expo/vector-icons';

import { colors, layout, radii } from '../styles';

export default function SegmentedTabs({ tabs, value, onChange, style, testID }) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="tablist" testID={testID}>
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, active && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tab.label}${Number.isFinite(tab.count) ? `, ${tab.count}` : ''}`}
          >
            {tab.icon ? <MaterialIcons name={tab.icon} size={16} color={active ? colors.white : colors.textSecondary} /> : null}
            <AppText style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}{Number.isFinite(tab.count) ? ` ${tab.count}` : ''}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row-reverse',
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  tab: {
    flex: 1,
    minHeight: layout.touchTarget,
    paddingHorizontal: 5,
    borderRadius: radii.pill,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabActive: { backgroundColor: colors.brand },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fontFamilies.medium,
    writingDirection: 'rtl',
  },
  labelActive: { color: colors.white },
});
