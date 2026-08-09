import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import AppText from './AppText';
import { colors } from '../styles';
import { fontFamilies } from '../styles/typography';

export default function MetadataLine({ icon = 'local-offer', values, style, testID }) {
  const normalizedValues = (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!normalizedValues.length) return null;

  const label = normalizedValues.join(' · ');

  return (
    <View
      style={[styles.line, style]}
      accessible
      accessibilityLabel={label}
      testID={testID}
    >
      <MaterialIcons name={icon} size={17} color={colors.textMuted} />
      <AppText style={styles.text}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    maxWidth: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
  },
  text: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fontFamilies.regular,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
