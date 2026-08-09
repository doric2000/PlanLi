import React from 'react';
import { Modal, View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import AppText from "./AppText";
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
          <AppText style={styles.unsavedDialogTitle}>{title}</AppText>
          <AppText style={styles.unsavedDialogMessage}>{message}</AppText>
          <View style={styles.unsavedDialogActions}>
            <TouchableOpacity
              style={[styles.unsavedDialogButton, styles.unsavedDialogButtonNeutral]}
              onPress={onCancel}
              testID={cancelTestID}
              activeOpacity={0.85}
            >
              <AppText style={styles.unsavedDialogButtonNeutralText}>לא</AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.unsavedDialogButton, styles.unsavedDialogButtonNeutral]}
              onPress={onConfirm}
              testID={confirmTestID}
              activeOpacity={0.85}
            >
              <AppText style={styles.unsavedDialogButtonDestructiveText}>כן</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
