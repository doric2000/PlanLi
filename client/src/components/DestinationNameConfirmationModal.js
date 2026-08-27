import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import AppText from './AppText';
import AppTextInput from './AppTextInput';
import { colors, layout, radii, spacing } from '../styles';
import { fontFamilies } from '../styles/typography';

export default function DestinationNameConfirmationModal({
  visible,
  englishName,
  value,
  busy = false,
  error = '',
  onChangeText,
  onCancel,
  onConfirm,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onCancel}
    >
      <Pressable
        style={styles.overlay}
        onPress={busy ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="סגירת אישור שם היעד"
      >
        <Pressable style={styles.card} onPress={() => {}} testID="home-destination-name-confirmation">
          <AppText style={styles.title}>אישור שם היעד</AppText>
          <AppText style={styles.body}>
            {englishName
              ? `כתבו את השם העברי שיוצג עבור ${englishName}.`
              : 'כתבו את השם העברי שיוצג עבור היעד.'}
          </AppText>
          <AppTextInput
            value={value}
            onChangeText={onChangeText}
            editable={!busy}
            autoCorrect={false}
            textAlign="right"
            accessibilityLabel="שם היעד בעברית"
            testID="home-destination-hebrew-name"
            style={styles.input}
          />
          {error ? <AppText style={styles.error} testID="home-destination-name-error">{error}</AppText> : null}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={onConfirm}
              disabled={busy || !value?.trim()}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !value?.trim() }}
              testID="home-destination-confirm-name"
            >
              {busy
                ? <ActivityIndicator size="small" color={colors.white} />
                : <AppText style={styles.primaryText}>אישור והמשך</AppText>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              testID="home-destination-cancel-name"
            >
              <AppText style={styles.cancelText}>בחירת יעד אחר</AppText>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: layout.screenPadding,
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceElevated,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 21,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fontFamilies.regular,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    minHeight: layout.touchTarget,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    writingDirection: 'rtl',
  },
  error: {
    marginTop: spacing.sm,
    color: colors.error,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actions: {
    marginTop: spacing.lg,
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  primaryButton: { backgroundColor: colors.brand },
  cancelButton: { backgroundColor: colors.surfaceSubtle },
  primaryText: { color: colors.white, fontFamily: fontFamilies.semiBold, writingDirection: 'rtl' },
  cancelText: { color: colors.textSecondary, fontFamily: fontFamilies.semiBold, writingDirection: 'rtl' },
});
