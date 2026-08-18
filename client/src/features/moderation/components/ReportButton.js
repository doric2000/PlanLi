import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import { AUTH_STATES, CAPABILITIES } from '../../../constants/authPolicy';
import { useAuth } from '../../auth/AuthContext';
import { setBlockedUser, submitReport } from '../../../services/SocialService';
import { colors, moderationStyles as styles } from '../../../styles';
import { REPORT_CATEGORIES } from '../constants/reportCategories';

export default function ReportButton({ target, ownerId, compact = false, color = colors.textSecondary }) {
  const { user, status, ensureCapability, handleCallableAuthError } = useAuth();
  const [visible, setVisible] = useState(false);
  const [category, setCategory] = useState(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selected = useMemo(() => REPORT_CATEGORIES.find((item) => item.id === category), [category]);
  if (
    !target?.id
    || ownerId === user?.uid
    || [AUTH_STATES.GUEST, AUTH_STATES.EMAIL_VERIFICATION_REQUIRED].includes(status)
  ) return null;

  const open = async () => {
    if (!await ensureCapability(CAPABILITIES.ACTIVE)) return;
    setVisible(true);
  };
  const close = () => {
    if (submitting) return;
    setVisible(false);
    setCategory(null);
    setDetails('');
  };
  const canSubmit = Boolean(category && (!selected?.detailsRequired || details.trim().length >= 5));
  const send = async () => {
    if (!canSubmit || submitting) return;
    if (!await ensureCapability(CAPABILITIES.ACTIVE)) {
      close();
      return;
    }
    setSubmitting(true);
    try {
      await submitReport(target, category, details.trim());
      setVisible(false);
      setCategory(null);
      setDetails('');
      Alert.alert(
        'הדיווח התקבל',
        ownerId ? 'תודה שעזרת לשמור על הקהילה. אפשר גם לחסום את המשתמש כדי שלא לראות את התוכן שלו.' : 'תודה שעזרת לשמור על הקהילה.',
        ownerId ? [
          { text: 'סיום', style: 'cancel' },
          { text: 'חסימת המשתמש', style: 'destructive', onPress: async () => {
            try {
              await setBlockedUser(ownerId, true);
              Alert.alert('המשתמש נחסם', 'התוכן והפעילות שלו יוסתרו עבורך.');
            } catch (error) {
              if (!handleCallableAuthError(error)) Alert.alert('לא הצלחנו לחסום', 'אפשר לנסות שוב מאוחר יותר.');
            }
          } },
        ] : [{ text: 'סיום' }]
      );
    } catch (error) {
      if (!handleCallableAuthError(error)) Alert.alert('הדיווח לא נשלח', 'אפשר לנסות שוב בעוד כמה רגעים.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Pressable style={styles.reportButton} onPress={open} accessibilityRole="button" accessibilityLabel="דיווח על תוכן">
        <Ionicons name="flag-outline" size={compact ? 19 : 21} color={color} />
        {!compact ? <AppText style={[styles.reportLabel, { color }]}>דיווח</AppText> : null}
      </Pressable>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <AppText style={styles.title}>דיווח על תוכן</AppText>
              <Pressable onPress={close} hitSlop={12} accessibilityLabel="סגירה">
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>
            <AppText style={styles.subtitle}>מה הסיבה המתאימה ביותר? הדיווח פרטי וייבדק על ידי צוות פלאן לי.</AppText>
            <ScrollView showsVerticalScrollIndicator={false}>
              {REPORT_CATEGORIES.map((item) => (
                <Pressable key={item.id} style={[styles.category, category === item.id && styles.categorySelected]} onPress={() => setCategory(item.id)}>
                  <Ionicons name={category === item.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={category === item.id ? colors.primary : colors.textSecondary} />
                  <AppText style={styles.categoryText}>{item.label}</AppText>
                </Pressable>
              ))}
              {category ? (
                <>
                  <AppTextInput
                    style={styles.input}
                    value={details}
                    onChangeText={(value) => setDetails(value.slice(0, 500))}
                    placeholder={selected?.detailsRequired ? 'ספרו לנו מה קרה (חובה)' : 'פרטים נוספים (לא חובה)'}
                    multiline
                    maxLength={500}
                  />
                  <AppText style={styles.count}>{details.length}/500</AppText>
                </>
              ) : null}
            </ScrollView>
            <Pressable style={[styles.submit, (!canSubmit || submitting) && styles.submitDisabled]} disabled={!canSubmit || submitting} onPress={send}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.submitText}>שליחת דיווח</AppText>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
