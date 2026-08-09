import React from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
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
            <Text style={styles.title}>סינון יעדים</Text>
            <View style={styles.close} />
          </View>
          <Text style={styles.sectionTitle}>מיון</Text>
          <View style={styles.options}>
            {SORTS.map((option) => {
              const selected = sortBy === option.key;
              return (
                <TouchableOpacity key={option.key} style={[styles.option, selected && styles.optionSelected]} onPress={() => onSortChange(option.key)}>
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.brand : colors.textMuted} />
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.switchRow, !favoritesAvailable && styles.disabled]}>
            <Switch
              value={savedOnly}
              onValueChange={onSavedOnlyChange}
              disabled={!favoritesAvailable}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor={colors.white}
            />
            <View style={styles.switchText}>
              <Text style={styles.optionText}>מועדפים בלבד</Text>
              {!favoritesAvailable ? <Text style={styles.hint}>יש להתחבר כדי לסנן לפי מועדפים</Text> : null}
            </View>
          </View>
          <TouchableOpacity style={styles.done} onPress={onClose} accessibilityRole="button">
            <Text style={styles.doneText}>הצגת יעדים</Text>
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
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', writingDirection: 'rtl' },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.textSecondary, fontSize: 13, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  options: { gap: 8 },
  option: { minHeight: 50, paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.surfaceSubtle },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  optionTextSelected: { color: colors.brand },
  switchRow: { minHeight: 62, marginTop: spacing.md, paddingHorizontal: 14, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, alignItems: 'flex-end' },
  hint: { marginTop: 2, color: colors.textMuted, fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  disabled: { opacity: 0.56 },
  done: { minHeight: 50, marginTop: spacing.lg, borderRadius: radii.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.white, fontSize: 15, fontWeight: '800', writingDirection: 'rtl' },
});
