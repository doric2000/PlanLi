import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import AppText from './AppText';
import { colors } from '../styles';
import { fontFamilies } from '../styles/typography';

export default function CompactChip({
  label,
  icon,
  selected = false,
  disabled = false,
  interactive = true,
  selectionRole = 'checkbox',
  onPress,
  testID,
  accessibilityLabel,
  style,
  textStyle,
  iconSize = 18,
}) {
  const content = (
    <>
      {!!icon && (
        <MaterialIcons
          name={icon}
          size={iconSize}
          color={disabled ? colors.textMuted : colors.primary}
        />
      )}
      <AppText
        numberOfLines={2}
        style={[styles.label, selected && styles.labelSelected, disabled && styles.labelDisabled, textStyle]}
      >
        {label}
      </AppText>
    </>
  );

  const sharedStyle = [
    styles.chip,
    selected && styles.selected,
    disabled && styles.disabled,
    style,
  ];

  if (!interactive) {
    return <View style={sharedStyle} testID={testID}>{content}</View>;
  }

  return (
    <Pressable
      style={({ pressed }) => [sharedStyle, pressed && !disabled && styles.pressed]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole={selectionRole}
      accessibilityLabel={accessibilityLabel || String(label || '')}
      accessibilityState={{ checked: selected, disabled }}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 38,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#DCE2EA',
    backgroundColor: colors.white,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: '#EEF3F8',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamilies.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  labelSelected: {
    color: colors.primary,
  },
  labelDisabled: {
    color: colors.textMuted,
  },
});
