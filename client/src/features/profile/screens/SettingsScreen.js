import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import PageHeader from '../../../components/PageHeader';
import RtlBackButton from '../../../components/RtlBackButton';
import { auth } from '../../../config/firebase';
import {
  formatAuthError,
  getProviderIds,
  isProviderCancellation,
  reauthenticateWithApple,
  reauthenticateWithGoogle,
  reauthenticateWithPassword,
  revokeGoogleAccessForDeletion,
  signOutCentral,
} from '../../../services/AuthService';
import { requestAccountDeletion } from '../../../services/SocialService';
import { resetPersonalizationActivity } from '../../../services/PersonalizationService';
import { colors, settingsHubStyles as styles } from '../../../styles';
import {
  clearGuestNoyaProfile,
} from '../services/NoyaOnboardingStorage';
import { useNoyaTour } from '../../noya/NoyaTourContext';

function SettingsRow({
  accessibilityRole = 'button',
  checked,
  detail,
  danger = false,
  disabled = false,
  icon,
  label,
  last = false,
  loading = false,
  onPress,
  testID,
  trailing,
}) {
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled, busy: loading, ...(typeof checked === 'boolean' ? { checked } : {}) }}
      activeOpacity={0.82}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.row,
        last && styles.rowLast,
        disabled && styles.rowDisabled,
      ]}
      testID={testID}
    >
      <View style={[styles.iconBubble, danger && styles.dangerIcon]}>
        <Ionicons name={icon} size={19} color={danger ? '#B42318' : colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <AppText style={[styles.rowName, danger && styles.dangerText]}>{label}</AppText>
        {detail ? <AppText style={styles.rowDetail}>{detail}</AppText> : null}
      </View>
      {trailing || (loading ? (
        <ActivityIndicator color={danger ? '#B42318' : colors.primary} size="small" />
      ) : (
        <Ionicons
          accessibilityElementsHidden
          color={colors.textMuted}
          importantForAccessibility="no"
          name="chevron-back"
          size={18}
        />
      ))}
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ navigation }) {
  const [deleting, setDeleting] = useState(false);
  const [resettingPersonalization, setResettingPersonalization] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [startingTour, setStartingTour] = useState(false);
  const { restartMainTour } = useNoyaTour();
  const providerIds = useMemo(() => getProviderIds(auth.currentUser), [auth.currentUser]);
  const hasPasswordProvider = providerIds.includes('password');

  const resetPersonalization = () => {
    Alert.alert(
      'איפוס התאמה אישית',
      'למחוק את הלמידה מלייקים, שמירות ופתיחת המלצות? העדפות הפרופיל יישמרו.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'איפוס',
          style: 'destructive',
          onPress: async () => {
            setResettingPersonalization(true);
            try {
              await resetPersonalizationActivity();
              await clearGuestNoyaProfile();
              Alert.alert('הושלם', 'למידת ההתאמה האישית אופסה.');
            } catch (error) {
              Alert.alert('שגיאה', error?.message || 'לא הצלחנו לאפס את ההתאמה.');
            } finally {
              setResettingPersonalization(false);
            }
          },
        },
      ]
    );
  };

  const confirmDeletion = () => {
    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm('למחוק לצמיתות את החשבון ואת כל התוכן שלכם?'));
    }
    return new Promise((resolve) => Alert.alert(
      'מחיקת חשבון',
      'החשבון, התוכן, המועדפים והתמונות יימחקו לצמיתות. לא ניתן לבטל את הפעולה.',
      [
        { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
        { text: 'המשך למחיקה', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: false }
    ));
  };

  const completeDeletion = async (payload = {}) => {
    setDeleting(true);
    try {
      if (providerIds.includes('google.com')) await revokeGoogleAccessForDeletion();
      await requestAccountDeletion(payload);
      await signOutCentral().catch(() => {});
    } catch (error) {
      if (!isProviderCancellation(error)) {
        Alert.alert('לא ניתן למחוק את החשבון', formatAuthError(error));
      }
    } finally {
      setDeleting(false);
    }
  };

  const deleteAccount = async () => {
    if (!await confirmDeletion()) return;
    try {
      if (providerIds.includes('apple.com')) {
        if (Platform.OS !== 'ios') {
          Alert.alert('נדרש iPhone', 'כדי למחוק חשבון Apple יש לבצע אימות מחדש ממכשיר iPhone.');
          return;
        }
        setDeleting(true);
        const payload = await reauthenticateWithApple();
        await completeDeletion(payload);
        return;
      }
      if (providerIds.includes('google.com')) {
        setDeleting(true);
        await reauthenticateWithGoogle();
        await completeDeletion();
        return;
      }
      if (hasPasswordProvider) {
        setPassword('');
        setPasswordModalVisible(true);
        return;
      }
      Alert.alert('לא ניתן למחוק את החשבון', 'לא נמצאה שיטת התחברות נתמכת לאימות מחדש.');
    } catch (error) {
      if (!isProviderCancellation(error)) {
        Alert.alert('האימות מחדש נכשל', formatAuthError(error));
      }
      setDeleting(false);
    }
  };

  const deletePasswordAccount = async () => {
    if (!password) return;
    setDeleting(true);
    try {
      await reauthenticateWithPassword(password);
      setPasswordModalVisible(false);
      setPassword('');
      await completeDeletion();
    } catch (error) {
      Alert.alert('האימות מחדש נכשל', formatAuthError(error));
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe} testID="settings-screen">
      <Modal
        animationType="fade"
        onRequestClose={() => !deleting && setPasswordModalVisible(false)}
        transparent
        visible={passwordModalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AppText style={styles.modalTitle}>אימות לפני מחיקה</AppText>
            <AppText style={styles.modalText}>הזינו את הסיסמה כדי למחוק את החשבון לצמיתות.</AppText>
            <AppTextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="סיסמה"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              style={styles.modalInput}
              testID="delete-account-password-input"
              value={password}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                activeOpacity={0.82}
                disabled={deleting}
                onPress={() => setPasswordModalVisible(false)}
                style={styles.modalCancelButton}
              >
                <AppText style={styles.modalCancelText}>ביטול</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.82}
                disabled={deleting || !password}
                onPress={deletePasswordAccount}
                style={[styles.modalDeleteButton, deleting && styles.buttonDisabled]}
                testID="delete-account-password-confirm"
              >
                {deleting
                  ? <ActivityIndicator color={colors.white} />
                  : <AppText style={styles.modalDeleteText}>מחקו חשבון</AppText>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PageHeader
        renderStart={() => (
          <RtlBackButton onPress={() => navigation.goBack()} testID="settings-back-button" />
        )}
        testID="settings-header"
        title="הגדרות"
        variant="detail"
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <AppText style={styles.sectionTitle}>חשבון</AppText>
        <View style={styles.group} testID="settings-account-section">
          <SettingsRow
            detail="עדכון השם שמוצג בפרופיל"
            icon="person-outline"
            label="שינוי שם"
            onPress={() => navigation.navigate('ChangeName')}
            testID="settings-change-name-button"
          />
          {hasPasswordProvider ? (
            <SettingsRow
              detail="אבטחת החשבון ופרטי ההתחברות"
              icon="lock-closed-outline"
              label="שינוי סיסמה"
              onPress={() => navigation.navigate('ChangePassword')}
              testID="settings-change-password-button"
            />
          ) : null}
          <SettingsRow
            detail="צפייה וניהול של רשימת החסימות"
            icon="person-remove-outline"
            label="משתמשים שחסמת"
            last
            onPress={() => navigation.navigate('BlockedUsers')}
            testID="settings-blocked-users-button"
          />
        </View>

        <AppText style={styles.sectionTitle}>התאמה אישית</AppText>
        <View style={styles.group} testID="settings-noya-section">
          <SettingsRow
            detail="צפייה ועדכון של ההעדפות שסידרת עם נועה"
            icon="sparkles-outline"
            label="ההתאמה שלי עם נועה"
            onPress={() => navigation.navigate('PreferenceSetup', { source: 'profile' })}
            testID="settings-open-noya-button"
          />
          <SettingsRow
            detail="ארבעה צעדים קצרים בין המסכים המרכזיים"
            disabled={startingTour}
            icon="compass-outline"
            label="סיור קצר עם נועה"
            last
            loading={startingTour}
            onPress={async () => {
              setStartingTour(true);
              try {
                await restartMainTour();
              } finally {
                setStartingTour(false);
              }
            }}
            testID="settings-noya-tour-row"
          />
        </View>
        <View style={styles.personalizationCard} testID="settings-personalization-section">
          <View style={styles.personalizationTop}>
            <View style={styles.personalizationIcon}>
              <Ionicons name="options-outline" size={20} color={colors.white} />
            </View>
            <View style={styles.personalizationCopy}>
              <AppText style={styles.personalizationTitle}>ההתאמה האישית פעילה</AppText>
              <AppText style={styles.personalizationText}>
                לייקים, שמירות ופתיחת המלצות משפרים את סדר התוצאות עבורך.
              </AppText>
            </View>
          </View>
          <TouchableOpacity
            accessibilityLabel="איפוס הלמידה"
            accessibilityRole="button"
            accessibilityState={{ disabled: resettingPersonalization, busy: resettingPersonalization }}
            activeOpacity={0.82}
            disabled={resettingPersonalization}
            onPress={resetPersonalization}
            style={[styles.resetButton, resettingPersonalization && styles.buttonDisabled]}
            testID="settings-reset-personalization-button"
          >
            {resettingPersonalization ? (
              <ActivityIndicator color="#8A5507" size="small" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#8A5507" />
            )}
            <AppText style={styles.resetText}>איפוס הלמידה</AppText>
          </TouchableOpacity>
        </View>

        <AppText style={styles.sectionTitle}>פרטיות וקהילה</AppText>
        <View style={styles.group} testID="settings-legal-section">
          <SettingsRow
            icon="document-text-outline"
            label="תנאי שימוש"
            onPress={() => navigation.navigate('Terms')}
            testID="settings-terms-button"
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="מדיניות פרטיות"
            onPress={() => navigation.navigate('Privacy')}
            testID="settings-privacy-button"
          />
          <SettingsRow
            icon="people-outline"
            label="כללי הקהילה"
            last
            onPress={() => navigation.navigate('CommunityGuidelines')}
            testID="settings-community-guidelines-button"
          />
        </View>

        <AppText style={styles.sectionTitle}>ניהול חשבון</AppText>
        <View style={[styles.group, styles.dangerGroup]} testID="settings-danger-section">
          <SettingsRow
            danger
            detail="מחיקה לצמיתות של החשבון והתוכן"
            disabled={deleting}
            icon="trash-outline"
            label="מחיקת חשבון"
            last
            loading={deleting}
            onPress={deleteAccount}
            testID="settings-delete-account-button"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
