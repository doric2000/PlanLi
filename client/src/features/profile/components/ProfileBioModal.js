import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
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

  const normalizedDraft = useMemo(() => normalizeProfileBio(draft), [draft]);
  const dirty = normalizedDraft !== normalizeProfileBio(initialValue);

  const updateDraft = (value) => {
    setDraft(Array.from(value || '').slice(0, PROFILE_BIO_MAX_LENGTH).join(''));
  };

  const requestClose = () => {
    if (!dirty && !saving) {
      onClose?.();
      return;
    }
    Alert.alert(
      'לבטל את העריכה?',
      'השינויים שעדיין לא נשמרו יימחקו.',
      [
        { text: 'להמשיך לערוך', style: 'cancel' },
        { text: 'לבטל שינויים', style: 'destructive', onPress: () => onClose?.() },
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
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>המשפט שלי</Text>
            <Pressable
              onPress={requestClose}
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel="סגירת עריכת המשפט"
            >
              <MaterialIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.modalHelper}>המשפט יופיע בפרופיל שלך ויהיה גלוי לקהילת PlanLi.</Text>
          <TextInput
            value={draft}
            onChangeText={updateDraft}
            multiline
            autoFocus
            placeholder="מה כדאי לדעת עליכם?"
            placeholderTextColor={colors.textMuted}
            style={styles.bioInput}
            accessibilityLabel="משפט פרופיל"
          />
          <Text style={styles.bioCount}>
            {profileBioLength(draft)}/{PROFILE_BIO_MAX_LENGTH}
          </Text>
          {error ? <Text style={styles.modalError}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <Pressable
              onPress={requestClose}
              style={[styles.modalButton, styles.modalButtonSecondary]}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={[styles.modalButtonText, styles.modalButtonTextSecondary]}>ביטול</Text>
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
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>שמירה</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
