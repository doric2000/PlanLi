import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppText from './AppText';
import NavigationChevron from './NavigationChevron';
import { colors, backButtonStyles as styles } from '../styles';

// Used inside larger return actions that need to keep their destination label.
export function BackLabel({ children, style, color, ...props }) {
  const iconColor = color || StyleSheet.flatten(style)?.color || colors.primary;
  return <View style={styles.label}>
    <NavigationChevron aria-hidden size={24} color={iconColor} style={styles.labelIcon} />
    <AppText {...props} style={[style, styles.labelText]}>{children}</AppText>
  </View>;
}

function NavigationBackButton(props) {
  const navigation = useNavigation();
  return <BackButton {...props} onPress={() => navigation.goBack()} />;
}

// Explicit handlers also work outside a navigation provider (dialogs and headers).
export function BackButton({
  color = 'white', variant = 'overlay', onPress, style,
  accessibilityLabel = 'חזרה', accessibilityState, disabled = false,
  // Retain compatibility with old callers; all Hebrew back controls face right.
  iconDirection: _iconDirection, size: _size, ...props
}) {
  if (!onPress) return <NavigationBackButton {...props} color={color} variant={variant}
    style={style} accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState} disabled={disabled} />;
  const iconColor = color === 'white' ? colors.white : color === 'dark' ? colors.primary : color;
  const backgroundColor = variant === 'solid' ? colors.surfaceSubtle
    : variant === 'ghost' ? 'transparent' : 'rgba(255,255,255,0.2)';
  return <TouchableOpacity {...props} onPress={onPress} disabled={disabled}
    style={[style, styles.button, { backgroundColor }, disabled && styles.disabled]}
    activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ ...accessibilityState, disabled }}>
    <NavigationChevron aria-hidden size={24} color={iconColor} />
  </TouchableOpacity>;
}

export default BackButton;
