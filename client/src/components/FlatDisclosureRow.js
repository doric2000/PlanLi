import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from './AppText';
import { colors } from '../styles';
import { fontFamilies } from '../styles/typography';

export default function FlatDisclosureRow({ title, summary, expanded, onPress, testID }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: Boolean(expanded) }}
      accessibilityLabel={`${title}, ${summary}`}
      testID={testID}
    >
      <View style={styles.copy}>
        <AppText style={styles.title}>{title}</AppText>
        {!!summary && <AppText style={styles.summary} numberOfLines={1}>{summary}</AppText>}
      </View>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  pressed: { opacity: 0.68 },
  copy: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summary: {
    maxWidth: '100%',
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
