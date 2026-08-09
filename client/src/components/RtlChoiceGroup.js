import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, ScrollView, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import AppText from "./AppText";
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles';
import { guidedFormStyles as styles } from './guidedFormStyles';

const optionId = (option) => typeof option === 'string' ? option : option?.id ?? option?.value ?? option?.label;
const optionLabel = (option) => typeof option === 'string' ? option : option?.postLabel ?? option?.label ?? String(optionId(option));

export default function RtlChoiceGroup({
  label,
  helper,
  error,
  options = [],
  selectedIds = [],
  onToggle,
  selectionMode = 'multiple',
  maxSelected,
  variant = 'chip',
  layout = 'wrap',
  getItemTheme,
  testIDPrefix,
}) {
  const scrollRef = useRef(null);
  const { width } = useWindowDimensions();
  const isResponsiveRail = layout === 'responsive';
  const useRail = layout === 'rail' || (isResponsiveRail && width < 720);
  const selected = useMemo(() => new Set(Array.isArray(selectedIds) ? selectedIds : [selectedIds].filter(Boolean)), [selectedIds]);

  const alignRailToRight = useCallback(() => {
    if (!useRail) return;
    scrollRef.current?.scrollToEnd?.({ animated: false });
  }, [useRail]);

  useEffect(() => {
    if (useRail) alignRailToRight();
  }, [alignRailToRight, options.length, useRail]);

  const content = options.map((option, index) => {
    const id = optionId(option);
    const active = selected.has(id);
    const disabled = selectionMode === 'multiple' && Number.isFinite(maxSelected) && !active && selected.size >= maxSelected;
    const theme = typeof getItemTheme === 'function' ? getItemTheme(optionLabel(option), option) : null;
    const baseStyle = variant === 'tile'
      ? styles.choiceTile
      : variant === 'segment'
        ? styles.choiceSegment
        : styles.choiceChip;
    const activeTheme = active && theme ? {
      backgroundColor: theme.backgroundColor,
      borderColor: theme.borderColor,
    } : null;
    const activeTextTheme = active && theme ? { color: theme.textColor } : null;
    return (
      <TouchableOpacity
        key={String(id)}
        style={[baseStyle, active && styles.choiceSelected, activeTheme, disabled && styles.choiceDisabled]}
        onPress={() => onToggle?.(id)}
        disabled={disabled}
        accessibilityRole={selectionMode === 'single' ? 'radio' : 'checkbox'}
        accessibilityLabel={optionLabel(option)}
        accessibilityState={{ checked: active, disabled }}
        activeOpacity={0.78}
        testID={testIDPrefix ? `${testIDPrefix}-${index}` : undefined}
      >
        {variant === 'tile' && option?.icon ? (
          <MaterialIcons name={option.icon} size={22} color={active && !theme ? colors.white : colors.primary} />
        ) : null}
        <AppText style={[styles.choiceText, active && styles.choiceTextSelected, activeTextTheme]}>{optionLabel(option)}</AppText>
      </TouchableOpacity>
    );
  });

  return (
    <View style={styles.fieldGroup}>
      {!!label && <AppText style={styles.fieldLabel}>{label}</AppText>}
      {!!helper && <AppText style={styles.fieldHelper}>{helper}</AppText>}
      {useRail ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.choiceRail}
          contentContainerStyle={styles.choiceRailContent}
          onContentSizeChange={alignRailToRight}
          keyboardShouldPersistTaps="handled"
          testID={testIDPrefix ? `${testIDPrefix}-rail` : undefined}
          {...(Platform.OS === 'web' ? { dir: 'rtl' } : {})}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.choiceWrap} testID={testIDPrefix ? `${testIDPrefix}-wrap` : undefined}>{content}</View>
      )}
      {!!error && <AppText style={styles.fieldError} accessibilityLiveRegion="polite">{error}</AppText>}
    </View>
  );
}
