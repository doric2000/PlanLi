import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import AppText from './AppText';
import { colors } from '../styles';
import { fontFamilies } from '../styles/typography';

export default function UsefulFactItem({ icon, title, value, style, testID }) {
  return (
    <View
      style={[styles.item, style]}
      accessible
      accessibilityLabel={`${title}: ${value}`}
      testID={testID}
    >
      <MaterialIcons name={icon} size={21} color={colors.textSecondary} />
      <View style={styles.copy}>
        <AppText style={styles.title}>{title}</AppText>
        <AppText style={styles.value}>{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: 68,
    paddingVertical: 8,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fontFamilies.regular,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  value: {
    marginTop: 3,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fontFamilies.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
