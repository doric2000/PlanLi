import React from 'react';
import { View, Text } from 'react-native';

import { colors, profileBadgeStyles as styles } from '../../../styles';



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
