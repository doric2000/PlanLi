import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AppText from "../../../components/AppText";
import AppTextInput from "../../../components/AppTextInput";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { formatProfileUpdateError, saveProfile } from '../../../services/ProfileService';
import { changeNameScreenStyles as styles } from '../../../styles';
import { useUnsavedLeaveGuard } from '../../../hooks/useUnsavedLeaveGuard';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal';
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from '../../../constants/unsavedLeaveStrings';
import { useAuth } from '../../auth/AuthContext';
import {
  normalizeDisplayName,
  sanitizeDisplayNameInput,
  validateDisplayName,
} from '../../auth/utils/displayName';


export default function ChangeNameScreen({ navigation }) {
  const { user: u, userDocument } = useAuth();
  const nameBaseline = useMemo(() => normalizeDisplayName(u?.displayName), [u?.displayName]);
  const [name, setName] = useState(() => (u?.displayName || ''));
  const [saving, setSaving] = useState(false);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);

  const emailVerified = u?.emailVerified === true;
  const nameChangeAlreadyUsed = Boolean(userDocument?.profileManagement?.displayNameChangedAt);
  const canChangeName = emailVerified && !nameChangeAlreadyUsed;
  const normalizedName = normalizeDisplayName(name);
  const hasUnsavedChanges = normalizedName !== nameBaseline;

  const pendingDiscardRef = useRef(null);
  const dismissUnsavedModal = useCallback(() => {
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
  }, []);

  const confirmUnsavedLeave = useCallback(() => {
    const onConfirm = pendingDiscardRef.current;
    setUnsavedModalVisible(false);
    pendingDiscardRef.current = null;
    if (onConfirm) onConfirm();
  }, []);

  const promptDiscardUnsaved = useCallback((onConfirmLeave) => {
    pendingDiscardRef.current = onConfirmLeave;
    setUnsavedModalVisible(true);
  }, []);

  const { allowLeaveRef, handleHeaderBackPress } = useUnsavedLeaveGuard({
    navigation,
    guardActive: Boolean(u),
    sessionKey: u?.uid ?? '',
    hasUnsavedChanges,
    submitting: saving,
    openUnsavedPrompt: promptDiscardUnsaved,
  });

  const onSave = async () => {
    if (!u) return Alert.alert('שגיאה', 'אין משתמש מחובר');
    if (!emailVerified) {
      return Alert.alert('נדרש אימות אימייל', 'כדי לשנות את השם צריך לאמת קודם את כתובת האימייל.');
    }
    if (nameChangeAlreadyUsed) {
      return Alert.alert('לא ניתן לשנות שוב', 'אפשר לשנות את השם פעם אחת בלבד.');
    }
    const next = normalizeDisplayName(name);
    const validationError = validateDisplayName(next);
    if (validationError) return Alert.alert('שם לא תקין', validationError);
    if (!hasUnsavedChanges) return Alert.alert('אין שינוי', 'יש להזין שם שונה מהשם הנוכחי.');

    setSaving(true);
    try {
      await saveProfile({ displayName: next });
      await u.reload();

      Alert.alert('הצלחה', 'השם עודכן בהצלחה', [
        {
          text: 'אישור',
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.goBack();
          },
        },
      ]);
    } catch (error) {
      Alert.alert('לא הצלחנו לעדכן', formatProfileUpdateError(error, 'עדכון השם נכשל. נסו שוב.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="change-name-screen">
      <UnsavedChangesModal
        visible={unsavedModalVisible}
        title={UNSAVED_LEAVE_TITLE}
        message={UNSAVED_LEAVE_MESSAGE}
        onCancel={dismissUnsavedModal}
        onConfirm={confirmUnsavedLeave}
        testID="change-name-unsaved-modal"
        cancelTestID="change-name-unsaved-cancel"
        confirmTestID="change-name-unsaved-confirm"
      />
      {/* Header: back left + title center */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleHeaderBackPress}
          style={styles.backBtn}
          activeOpacity={0.8}
          testID="change-name-back"
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>

        <AppText style={styles.headerTitle}>שינוי שם</AppText>

        <View style={styles.rightSpacer} />
      </View>

      <View style={styles.container}>
        <AppText style={[styles.notice, !canChangeName && styles.noticeBlocked]} testID="change-name-notice">
          {nameChangeAlreadyUsed
            ? 'כבר השתמשת באפשרות שינוי השם. לא ניתן לשנות אותו שוב.'
            : !emailVerified
              ? 'כדי לשנות שם צריך לאמת קודם את כתובת האימייל.'
              : 'אפשר לשנות את השם פעם אחת בלבד. לאחר השמירה לא ניתן יהיה לשנות אותו שוב.'}
        </AppText>
        <AppText style={styles.label}>שם חדש</AppText>
        <AppTextInput
          style={styles.input}
          value={name}
          onChangeText={(value) => setName(sanitizeDisplayNameInput(value))}
          placeholder="כאן מוסיפים את השם החדש"
          placeholderTextColor="#9aa3af"
          autoCapitalize="words"
          textAlign="right"
          writingDirection="rtl"
          editable={canChangeName && !saving}
          testID="change-name-input"
        />

        <TouchableOpacity
          style={[styles.primaryBtn, (!canChangeName || saving || !hasUnsavedChanges) && styles.btnDisabled]}
          activeOpacity={0.9}
          onPress={onSave}
          disabled={!canChangeName || saving || !hasUnsavedChanges}
          testID="change-name-submit"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <AppText style={styles.primaryBtnText}>שמירת שינוי חד־פעמי</AppText>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
