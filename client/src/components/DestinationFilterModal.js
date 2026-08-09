import { fontFamilies } from "../styles/typography";
import React from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';

import { colors, layout, radii, spacing } from '../styles';

const SORTS = [
  { key: 'popular', label: 'הכי פופולריים' },
  { key: 'name', label: 'לפי שם א–ת' },
];

export default function DestinationFilterModal({ visible, onClose, sortBy, onSortChange, savedOnly, onSavedOnlyChange, favoritesAvailable }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="סגירת סינון">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <AppText style={styles.title}>סינון יעדים</AppText>
            <View style={styles.close} />
          </View>
          <AppText style={styles.sectionTitle}>מיון</AppText>
          <View style={styles.options}>
            {SORTS.map((option) => {
              const selected = sortBy === option.key;
              return (
                <TouchableOpacity key={option.key} style={[styles.option, selected && styles.optionSelected]} onPress={() => onSortChange(option.key)}>
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.brand : colors.textMuted} />
                  <AppText style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</AppText>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            testID="destination-saved-only-filter"
            style={[
              styles.option,
              styles.savedOption,
              savedOnly && styles.optionSelected,
              !favoritesAvailable && styles.disabled,
            ]}
            onPress={() => onSavedOnlyChange(!savedOnly)}
            disabled={!favoritesAvailable}
            accessibilityRole="checkbox"
            accessibilityLabel="מועדפים בלבד"
            accessibilityState={{ checked: savedOnly, disabled: !favoritesAvailable }}
          >
            <Ionicons
              name={savedOnly ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={savedOnly ? colors.brand : colors.textMuted}
            />
            <View style={styles.savedCopy}>
              <AppText style={[styles.optionText, styles.savedTitle, savedOnly && styles.optionTextSelected]}>מועדפים בלבד</AppText>
              {!favoritesAvailable ? <AppText style={styles.hint}>יש להתחבר כדי לסנן לפי מועדפים</AppText> : null}
            </View>
            <Ionicons
              name={savedOnly ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={savedOnly ? colors.brand : colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.done} onPress={onClose} accessibilityRole="button">
            <AppText style={styles.doneText}>הצגת יעדים</AppText>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.32)' },
  sheet: {
    width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: layout.screenPadding,
    paddingTop: 10, paddingBottom: 30, backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
  },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10 },
  header: { minHeight: layout.touchTarget, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 20, fontFamily: fontFamilies.semiBold, writingDirection: 'rtl' },
  sectionTitle: { marginTop: spacing.lg, marginBottom: 2, color: colors.textSecondary, fontSize: 13, fontFamily: fontFamilies.medium, textAlign: 'right', writingDirection: 'rtl' },
  options: {},
  option: { minHeight: 54, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  optionSelected: { backgroundColor: '#F8FAFC' },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: 15, fontFamily: fontFamilies.medium, textAlign: 'right', writingDirection: 'rtl' },
  optionTextSelected: { color: colors.brand },
  savedOption: { minHeight: 62, marginTop: spacing.sm },
  savedCopy: { flex: 1, alignItems: 'flex-end' },
  savedTitle: { flex: 0 },
  hint: { marginTop: 2, color: colors.textMuted, fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  disabled: { opacity: 0.56 },
  done: { minHeight: 46, marginTop: spacing.lg, paddingHorizontal: 22, borderRadius: 23, backgroundColor: colors.brand, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.white, fontSize: 15, fontFamily: fontFamilies.medium, writingDirection: 'rtl' },
});
