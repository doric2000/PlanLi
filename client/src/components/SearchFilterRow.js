import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, layout } from '../styles';

export default function SearchFilterRow({
  children,
  onFilterPress,
  activeFilterCount = 0,
  accessibilityLabel = 'סינון',
  style,
  testID,
  filterTestID,
  searchTargetRef,
  searchTargetTestID,
  onSearchTargetLayout,
  filterTargetRef,
  onFilterTargetLayout,
}) {
  const active = activeFilterCount > 0;
  const resolvedAccessibilityLabel = active
    ? `${accessibilityLabel}, ${activeFilterCount} מסננים פעילים`
    : accessibilityLabel;

  return (
    <View style={[styles.row, style]} testID={testID}>
      <View
        collapsable={false}
        onLayout={onSearchTargetLayout}
        ref={searchTargetRef}
        style={styles.searchSlot}
        testID={searchTargetTestID}
      >
        {children}
      </View>
      <TouchableOpacity
        collapsable={false}
        onPress={onFilterPress}
        onLayout={onFilterTargetLayout}
        ref={filterTargetRef}
        activeOpacity={0.65}
        hitSlop={4}
        style={styles.filterButton}
        accessibilityRole="button"
        accessibilityLabel={resolvedAccessibilityLabel}
        accessibilityState={{ selected: active }}
        testID={filterTestID}
      >
        <Ionicons
          name={active ? 'options' : 'options-outline'}
          size={22}
          color={active ? colors.accentAction : colors.white}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  searchSlot: {
    flex: 1,
    minWidth: 0,
  },
  filterButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
