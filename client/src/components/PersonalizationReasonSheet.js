import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getPersonalizationReasonPresentation } from '../constants/travelPresentation';
import { usePersonalizationFeedback } from '../features/profile/context/PersonalizationFeedbackContext';
import { colors } from '../styles/colors';
import { fontFamilies } from '../styles/typography';
import AppText from './AppText';

export default function PersonalizationReasonSheet({ visible, onClose, personalization, target, item }) {
  const insets = useSafeAreaInsets();
  const { hide } = usePersonalizationFeedback();
  const reasons = (Array.isArray(personalization?.reasons) ? personalization.reasons : [])
    .map((reason) => ({ reason, presentation: getPersonalizationReasonPresentation(reason) }))
    .filter((entry) => entry.presentation)
    .slice(0, 3);

  const handleLess = async () => {
    onClose();
    await hide({ target, item });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="סגירת ההסבר">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="סגירה"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
            <AppText style={styles.title}>למה זה מופיע בשבילך?</AppText>
          </View>
          <AppText style={styles.intro}>אלה הסיבות העיקריות שבאמת השפיעו על הבחירה.</AppText>
          <View style={styles.reasons}>
            {reasons.map(({ reason, presentation }, index) => (
              <View style={styles.reasonRow} key={`${reason.code}:${reason.value || ''}:${index}`}>
                <View style={styles.iconCircle}>
                  <MaterialIcons name={presentation.icon} size={20} color={colors.primary} />
                </View>
                <View style={styles.reasonCopy}>
                  <AppText style={styles.reasonTitle}>{presentation.label}</AppText>
                  <AppText style={styles.reasonDetail}>{presentation.detail}</AppText>
                </View>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="להציג פחות פריטים כאלה"
            onPress={handleLess}
            style={styles.lessButton}
          >
            <MaterialIcons name="thumb-down-off-alt" size={20} color={colors.primary} />
            <AppText style={styles.lessText}>פחות דברים כאלה</AppText>
          </Pressable>
          <AppText style={styles.privacyNote}>המשוב משפיע רק על מה שיוצג לך.</AppText>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10, 27, 48, 0.54)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    backgroundColor: colors.white,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom: 14,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fontFamilies.bold,
    fontSize: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  intro: {
    marginTop: 2,
    color: colors.textSecondary,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  reasons: {
    marginTop: 18,
    gap: 14,
  },
  reasonRow: {
    minHeight: 64,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  reasonCopy: { flex: 1 },
  reasonTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  reasonDetail: {
    marginTop: 3,
    color: colors.textSecondary,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  lessButton: {
    minHeight: 50,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lessText: {
    color: colors.primary,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
  },
  privacyNote: {
    marginTop: 9,
    color: colors.textMuted,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
