import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { addRecommendationScreenStyles as styles } from '../styles';

/**
 * Shared discard-unsaved-changes dialog (same layout as recommendation edit).
 */
export default function UnsavedChangesModal({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  testID = 'unsaved-discard-modal',
  cancelTestID = 'unsaved-discard-cancel',
  confirmTestID = 'unsaved-discard-confirm',
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.unsavedDialogOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
        <View style={styles.unsavedDialogCard} testID={testID}>
          <Text style={styles.unsavedDialogTitle}>{title}</Text>
          <Text style={styles.unsavedDialogMessage}>{message}</Text>
          <View style={styles.unsavedDialogActions}>
            <TouchableOpacity
              style={[styles.unsavedDialogButton, styles.unsavedDialogButtonNeutral]}
              onPress={onCancel}
              testID={cancelTestID}
              activeOpacity={0.85}
            >
              <Text style={styles.unsavedDialogButtonNeutralText}>לא</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.unsavedDialogButton, styles.unsavedDialogButtonNeutral]}
              onPress={onConfirm}
              testID={confirmTestID}
              activeOpacity={0.85}
            >
              <Text style={styles.unsavedDialogButtonDestructiveText}>כן</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
