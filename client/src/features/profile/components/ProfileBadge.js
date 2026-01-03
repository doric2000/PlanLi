import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors } from '../../../styles';

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default function ProfileBadge({ text, variant = 'default' }) {
  const isVerified = variant === 'verified';
  const isMuted = variant === 'muted';

  const backgroundColor = isVerified ? colors.accent : colors.card;
  const borderColor = isVerified ? colors.accent : colors.border;
  const textColor = isVerified ? colors.white : colors.textPrimary;

  return (
    <View style={[styles.container, { backgroundColor, borderColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
}
