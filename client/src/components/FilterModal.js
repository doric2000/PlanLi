import React from 'react';
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	View,
	TouchableOpacity,
} from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { common, colors, buttons } from '../styles';
import { communityDiscoveryStyles as s } from '../styles/communityDiscovery';

export default function FilterModal({
  visible,
  title = 'מסננים',
  tall = false,
  onClose,
  onClear,
  onApply,
  clearText = 'נקה',
  applyText = 'הפעל מסננים',
  overlayStyle,
  contentStyle,
  children,
  presentation,
  subtitle,
}) {
  const insets = useSafeAreaInsets();
  const community = presentation === 'community';
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView style={common.modalKeyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[common.modalOverlay, overlayStyle, community && s.sheetOverlay, community && { paddingTop: insets.top }]} onPress={onClose}>
        <Pressable style={[tall ? common.modalContentTall : common.modalContent, contentStyle, community && s.sheet]}
          onPress={(event) => event.stopPropagation?.()}>
          {community ? <View style={s.sheetHeader}>
            <View style={s.sheetHeadingRow}>
              <TouchableOpacity style={[s.iconButton, s.mapButton]} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה">
                <Ionicons name="close-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              {!!onClear && <TouchableOpacity onPress={onClear} style={s.clearFilters} accessibilityRole="button" testID="filter-modal-clear">
                <AppText style={s.activeLabel}>{clearText}</AppText>
              </TouchableOpacity>}
              <AppText style={s.sheetTitle}>{title}</AppText>
            </View>
            {!!subtitle && <AppText style={s.suggestionHint}>{subtitle}</AppText>}
          </View> : <View style={[common.modalHeader, { flexDirection: 'row', alignItems: 'center' }]}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            <AppText style={[common.modalTitle, { textAlign: 'right', flex: 1 }]}>{title}</AppText>
          </View>}

          {children}

          {(onClear || onApply) && (
            <View style={community ? [s.sheetFooter, { paddingBottom: Math.max(insets.bottom, 12) }] : [common.modalActions, { flexDirection: 'row-reverse', paddingBottom: insets.bottom }]}>
              {!!onClear && !community && (
                <TouchableOpacity style={community ? s.secondaryAction : buttons.clear} onPress={onClear} accessibilityRole="button"
                  testID="filter-modal-clear">
                  <AppText style={community ? s.activeLabel : buttons.clearText}>{clearText}</AppText>
                </TouchableOpacity>
              )}

              {!!onApply && (
                <TouchableOpacity style={community ? s.stateButton : buttons.apply} onPress={onApply} accessibilityRole="button"
                  testID="filter-modal-apply">
                  <AppText style={community ? s.stateButtonText : buttons.applyText}>{applyText}</AppText>
                </TouchableOpacity>
              )}
            </View>
          )}
        </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
