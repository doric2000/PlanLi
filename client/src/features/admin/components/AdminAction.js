import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import AppText from '../../../components/AppText';
import { adminStyles as styles } from '../../../styles';

export default function AdminAction({
  label,
  onPress,
  danger = false,
  primary = false,
  compact = false,
  disabled = false,
  busy = false,
  testID,
  accessibilityLabel,
}) {
  const unavailable = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ busy, disabled: unavailable }}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        compact && styles.actionCompact,
        primary && styles.actionPrimary,
        danger && styles.danger,
        unavailable && styles.actionDisabled,
        pressed && !unavailable && styles.actionPressed,
      ]}
      onPress={onPress}
      disabled={unavailable}
    >
      {busy ? <ActivityIndicator size="small" color={danger ? '#B42318' : primary ? '#FFFFFF' : '#3448C5'} /> : null}
      <AppText style={[styles.actionText, primary && styles.actionPrimaryText, danger && styles.dangerText]}>
        {busy ? `${label}…` : label}
      </AppText>
    </Pressable>
  );
}
