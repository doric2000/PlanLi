import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  children,
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={common.modalOverlay}>
        <View style={tall ? common.modalContentTall : common.modalContent}>
          <View style={[common.modalHeader, { flexDirection: 'row', alignItems: 'center' }]}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            <Text style={[common.modalTitle, { textAlign: 'right', flex: 1 }]}>{title}</Text>
          </View>

          {children}

          {(onClear || onApply) && (
            <View style={[common.modalActions, { flexDirection: 'row-reverse' }]}>
              {!!onClear && (
                <TouchableOpacity style={buttons.clear} onPress={onClear}>
                  <Text style={buttons.clearText}>{clearText}</Text>
                </TouchableOpacity>
              )}

              {!!onApply && (
                <TouchableOpacity style={buttons.apply} onPress={onApply}>
                  <Text style={buttons.applyText}>{applyText}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
