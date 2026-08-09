import React from 'react';
import { View } from 'react-native';
import AppText from "../../../components/AppText";

import { colors, profileBadgeStyles as styles } from '../../../styles';



export default function ProfileBadge({ text, variant = 'default' }) {
  const isVerified = variant === 'verified';
  const isMuted = variant === 'muted';

  const backgroundColor = isVerified ? colors.accent : colors.card;
  const borderColor = isVerified ? colors.accent : colors.border;
  const textColor = isVerified ? colors.white : colors.textPrimary;

  return (
    <View style={[styles.container, { backgroundColor, borderColor }]}>
      <AppText style={[styles.text, { color: textColor }]}>{text}</AppText>
    </View>
  );
}
