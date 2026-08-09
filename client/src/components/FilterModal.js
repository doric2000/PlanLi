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
}) {
  const insets = useSafeAreaInsets();
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
        <Pressable style={[common.modalOverlay, overlayStyle]} onPress={onClose}>
        <Pressable style={[tall ? common.modalContentTall : common.modalContent, contentStyle]}
          onPress={(event) => event.stopPropagation?.()}>
          <View style={[common.modalHeader, { flexDirection: 'row', alignItems: 'center' }]}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירה">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            <AppText style={[common.modalTitle, { textAlign: 'right', flex: 1 }]}>{title}</AppText>
          </View>

          {children}

          {(onClear || onApply) && (
            <View style={[common.modalActions, { flexDirection: 'row-reverse', paddingBottom: insets.bottom }]}>
              {!!onClear && (
                <TouchableOpacity style={buttons.clear} onPress={onClear} accessibilityRole="button"
                  testID="filter-modal-clear">
                  <AppText style={buttons.clearText}>{clearText}</AppText>
                </TouchableOpacity>
              )}

              {!!onApply && (
                <TouchableOpacity style={buttons.apply} onPress={onApply} accessibilityRole="button"
                  testID="filter-modal-apply">
                  <AppText style={buttons.applyText}>{applyText}</AppText>
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
