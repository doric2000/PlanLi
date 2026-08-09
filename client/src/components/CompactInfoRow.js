import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import AppText from './AppText';
import { colors } from '../styles';
import { fontFamilies } from '../styles/typography';

export default function CompactInfoRow({ icon, label, style, testID }) {
  return (
    <View style={[styles.row, style]} testID={testID}>
      <MaterialIcons name={icon} size={22} color={colors.primary} />
      <AppText style={styles.label}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fontFamilies.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
