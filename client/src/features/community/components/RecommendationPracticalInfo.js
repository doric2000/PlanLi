import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { FormInput } from '../../../components/FormInput';
import {
  NEEDS,
  PRACTICAL_FACTS,
  getRecommendationPracticalOptions,
} from '../../../constants/travelTaxonomy';
import { colors, fontFamilies, layout, radii, spacing } from '../../../styles';

const needById = Object.fromEntries(NEEDS.map((item) => [item.value, item]));
const factById = Object.fromEntries(PRACTICAL_FACTS.map((item) => [item.value, item]));

function selectedOption(kind, value) {
  const source = kind === 'need' ? needById[value] : factById[value];
  return source ? { key: `${kind}:${value}`, kind, value, label: source.label } : null;
}

export default function RecommendationPracticalInfo({
  categoryId,
  subcategoryIds,
  needs,
  practicalFacts,
  note,
  onNeedsChange,
  onPracticalFactsChange,
  onNoteChange,
}) {
  const [moreVisible, setMoreVisible] = useState(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  const context = useMemo(
    () => getRecommendationPracticalOptions(categoryId, subcategoryIds),
    [categoryId, subcategoryIds]
  );
  const selected = useMemo(() => [
    ...(needs || []).map((value) => selectedOption('need', value)),
    ...(practicalFacts || []).map((value) => selectedOption('fact', value)),
  ].filter(Boolean), [needs, practicalFacts]);
  const selectedKeys = useMemo(() => new Set(selected.map((item) => item.key)), [selected]);
  const mainOptions = useMemo(() => {
    const output = [...selected];
    for (const option of context.suggested) {
      if (!selectedKeys.has(option.key) && output.length < 4) output.push(option);
    }
    return output;
  }, [context.suggested, selected, selectedKeys]);
  const mainKeys = useMemo(() => new Set(mainOptions.map((item) => item.key)), [mainOptions]);
  const hasMore = context.available.some((option) => !mainKeys.has(option.key));

  useEffect(() => {
    if (note) setNoteOpen(true);
  }, [note]);

  const toggle = (option) => {
    if (option.kind === 'need') {
      onNeedsChange((needs || []).includes(option.value)
        ? needs.filter((value) => value !== option.value)
        : [...(needs || []), option.value]);
      return;
    }
    onPracticalFactsChange((practicalFacts || []).includes(option.value)
      ? practicalFacts.filter((value) => value !== option.value)
      : [...(practicalFacts || []), option.value].slice(0, 12));
  };

  const isSelected = (option) => option.kind === 'need'
    ? (needs || []).includes(option.value)
    : (practicalFacts || []).includes(option.value);

  if (!categoryId) return null;

  return (
    <View style={styles.container} testID="recommendation-practical-info">
      <AppText style={styles.title}>מידע שיכול לעזור לאחרים · לא חובה</AppText>
      <AppText style={styles.helper}>בחרו רק פרטים שאתם יודעים בוודאות.</AppText>
      {mainOptions.length ? (
        <View style={styles.chipWrap}>
          {mainOptions.map((option) => {
            const checked = isSelected(option);
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.chip, checked && styles.chipSelected]}
                onPress={() => toggle(option)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                testID={`recommendation-practical-${option.kind}-${option.value}`}
              >
                {checked ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
                <AppText style={[styles.chipText, checked && styles.chipTextSelected]}>{option.label}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actions}>
        {hasMore ? (
          <TouchableOpacity
            style={styles.textButton}
            onPress={() => setMoreVisible(true)}
            accessibilityRole="button"
            testID="recommendation-practical-more"
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <AppText style={styles.textButtonLabel}>עוד אפשרויות</AppText>
          </TouchableOpacity>
        ) : <View />}
        <TouchableOpacity
          style={styles.textButton}
          onPress={() => setNoteOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded: noteOpen }}
          testID="recommendation-optional-accessibilityNote"
        >
          <Ionicons name={noteOpen ? 'chevron-up' : 'create-outline'} size={17} color={colors.primary} />
          <AppText style={styles.textButtonLabel}>עוד משהו שכדאי לדעת?</AppText>
        </TouchableOpacity>
      </View>

      {noteOpen ? (
        <View style={styles.noteField}>
          <FormInput
            label="מידע שימושי ונגישות"
            value={note || ''}
            onChangeText={onNoteChange}
            placeholder={context.notePlaceholder}
            multiline
            maxLength={500}
            rtl
            testID="recommendation-optional-input-accessibilityNote"
          />
        </View>
      ) : null}

      <Modal visible={moreVisible} transparent animationType="slide" onRequestClose={() => setMoreVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setMoreVisible(false)} accessibilityRole="button" accessibilityLabel="סגירת אפשרויות">
          <SafeAreaInsetsContext.Consumer>
            {(insets) => (
              <Pressable
                style={[styles.sheet, { paddingBottom: Math.max(insets?.bottom || 0, spacing.lg) }]}
                onPress={() => {}}
              >
                <View style={styles.handle} />
                <View style={styles.sheetHeader}>
                  <TouchableOpacity style={styles.closeButton} onPress={() => setMoreVisible(false)} accessibilityLabel="סגירה">
                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={styles.sheetCopy}>
                    <AppText style={styles.sheetTitle}>עוד מידע שימושי</AppText>
                    <AppText style={styles.sheetHelper}>אפשר לבחור כמה פרטים. הכול בגדר רשות.</AppText>
                  </View>
                  <View style={styles.closeButton} />
                </View>
                <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
                  {context.available.map((option) => {
                    const checked = isSelected(option);
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={styles.optionRow}
                        onPress={() => toggle(option)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        testID={`recommendation-practical-more-${option.kind}-${option.value}`}
                      >
                        <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? colors.primary : colors.textMuted} />
                        <AppText style={[styles.optionText, checked && styles.optionTextSelected]}>{option.label}</AppText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity style={styles.doneButton} onPress={() => setMoreVisible(false)} testID="recommendation-practical-more-done">
                  <AppText style={styles.doneText}>סיום</AppText>
                </TouchableOpacity>
              </Pressable>
            )}
          </SafeAreaInsetsContext.Consumer>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.xl },
  title: { color: colors.textPrimary, fontSize: 15, fontFamily: fontFamilies.semiBold, textAlign: 'right', writingDirection: 'rtl' },
  helper: { marginTop: 3, marginBottom: spacing.sm, color: colors.textSecondary, fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  chipWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 42, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.white, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5 },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { color: colors.textPrimary, fontSize: 13, fontFamily: fontFamilies.medium, writingDirection: 'rtl' },
  chipTextSelected: { color: colors.white },
  actions: { minHeight: 44, marginTop: spacing.xs, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  textButton: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, justifyContent: 'center' },
  textButtonLabel: { color: colors.primary, fontSize: 13, fontFamily: fontFamilies.medium, writingDirection: 'rtl' },
  noteField: { marginTop: spacing.sm },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.34)' },
  sheet: { width: '100%', maxWidth: 620, maxHeight: '78%', alignSelf: 'center', paddingHorizontal: layout.screenPadding, paddingTop: 10, backgroundColor: colors.surfaceElevated, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.sm },
  sheetHeader: { minHeight: layout.touchTarget, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  sheetCopy: { flex: 1, alignItems: 'center' },
  sheetTitle: { color: colors.textPrimary, fontSize: 19, fontFamily: fontFamilies.semiBold, textAlign: 'center', writingDirection: 'rtl' },
  sheetHelper: { marginTop: 2, color: colors.textSecondary, fontSize: 12, textAlign: 'center', writingDirection: 'rtl' },
  options: { marginTop: spacing.sm },
  optionsContent: { paddingBottom: spacing.sm },
  optionRow: { minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: 15, textAlign: 'right', writingDirection: 'rtl' },
  optionTextSelected: { color: colors.primary, fontFamily: fontFamilies.medium },
  doneButton: { minHeight: 48, marginTop: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.white, fontSize: 15, fontFamily: fontFamilies.semiBold },
});
