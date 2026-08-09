import React, { useEffect, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Keyboard,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	View,
} from 'react-native';
import AppText from "../../../components/AppText";
import AppTextInput from "../../../components/AppTextInput";
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../../../styles';
import {
  normalizeProfileBio,
  profileBioLength,
  PROFILE_BIO_MAX_LENGTH,
  validateProfileBio,
} from '../utils/profileBio';

export default function ProfileBioModal({
  visible,
  initialValue,
  onClose,
  onSave,
  styles,
}) {
  const inputRef = React.useRef(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setDraft(normalizeProfileBio(initialValue));
      setError('');
      setSaving(false);
    }
  }, [visible, initialValue]);

  useEffect(() => {
    if (!visible) return undefined;
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus?.();
    }, Platform.OS === 'web' ? 0 : 300);
    return () => clearTimeout(focusTimer);
  }, [visible]);

  const normalizedDraft = useMemo(() => normalizeProfileBio(draft), [draft]);
  const dirty = normalizedDraft !== normalizeProfileBio(initialValue);

  const updateDraft = (value) => {
    setDraft(Array.from(value || '').slice(0, PROFILE_BIO_MAX_LENGTH).join(''));
  };

  const requestClose = () => {
    if (!dirty && !saving) {
      Keyboard.dismiss();
      onClose?.();
      return;
    }
    Alert.alert(
      'לבטל את העריכה?',
      'השינויים שעדיין לא נשמרו יימחקו.',
      [
        { text: 'להמשיך לערוך', style: 'cancel' },
        {
          text: 'לבטל שינויים',
          style: 'destructive',
          onPress: () => {
            Keyboard.dismiss();
            onClose?.();
          },
        },
      ]
    );
  };

  const save = async () => {
    const validationError = validateProfileBio(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave?.(normalizedDraft);
      Keyboard.dismiss();
      onClose?.();
    } catch (saveError) {
      setError(saveError?.message || 'לא הצלחנו לשמור את המשפט כרגע.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="slide"
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        style={styles.modalKeyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <AppText style={styles.modalTitle}>המשפט שלי</AppText>
            <Pressable
              onPress={requestClose}
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel="סגירת עריכת המשפט"
            >
              <MaterialIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <AppText style={styles.modalHelper}>המשפט יופיע בפרופיל שלך ויהיה גלוי לקהילת PlanLi.</AppText>
          <AppTextInput
            ref={inputRef}
            value={draft}
            onChangeText={updateDraft}
            multiline
            autoFocus={false}
            blurOnSubmit={false}
            returnKeyType="default"
            textContentType="none"
            placeholder="מה כדאי לדעת עליכם?"
            placeholderTextColor={colors.textMuted}
            style={styles.bioInput}
            accessibilityLabel="משפט פרופיל"
          />
          <AppText style={styles.bioCount}>
            {profileBioLength(draft)}/{PROFILE_BIO_MAX_LENGTH}
          </AppText>
          {error ? <AppText style={styles.modalError}>{error}</AppText> : null}
            <View style={styles.modalActions}>
            <Pressable
              onPress={requestClose}
              style={[styles.modalButton, styles.modalButtonSecondary]}
              disabled={saving}
              accessibilityRole="button"
            >
              <AppText style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>ביטול</AppText>
            </Pressable>
            <Pressable
              onPress={save}
              style={[styles.modalButton, styles.modalButtonPrimary, saving && { opacity: 0.7 }]}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <AppText style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>שמירה</AppText>
              )}
            </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
