import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
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
import { preferenceSetupStyles as preferenceStyles, settingsScreenStyles as styles } from '../../../styles';

export default function SettingsScreen({ navigation }) {
  const [deleting, setDeleting] = useState(false);
  const [resettingPersonalization, setResettingPersonalization] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [password, setPassword] = useState('');
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
    <SafeAreaView style={styles.safe} testID="settings-screen">
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AppText style={styles.modalTitle}>אימות לפני מחיקה</AppText>
            <AppText style={styles.modalText}>הזינו את הסיסמה כדי למחוק את החשבון לצמיתות.</AppText>
            <AppTextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="סיסמה"
              placeholderTextColor="#9CA3AF"
              style={styles.modalInput}
              testID="delete-account-password-input"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setPasswordModalVisible(false)}
                disabled={deleting}
              >
                <AppText style={styles.modalCancelText}>ביטול</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteButton, deleting && styles.buttonDisabled]}
                onPress={deletePasswordAccount}
                disabled={deleting || !password}
                testID="delete-account-password-confirm"
              >
                {deleting
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <AppText style={styles.modalDeleteText}>מחקו חשבון</AppText>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.8}
          testID="settings-back-button"
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>הגדרות</AppText>
        <View style={styles.rightSpacer} />
      </View>

      <View style={styles.container}>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ChangeName')}
          testID="settings-change-name-button"
        >
          <AppText style={styles.primaryBtnText}>שינוי שם</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('BlockedUsers')}
          testID="settings-blocked-users-button"
        >
          <AppText style={styles.primaryBtnText}>משתמשים שחסמת</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={resetPersonalization}
          disabled={resettingPersonalization}
          testID="settings-reset-personalization-button"
        >
          {resettingPersonalization
            ? <ActivityIndicator color="#FFFFFF" />
            : <AppText style={styles.primaryBtnText}>איפוס התאמה אישית</AppText>}
        </TouchableOpacity>

        <View style={preferenceStyles.promptCard}>
          <AppText style={preferenceStyles.promptTitle}>התאמה אישית פעילה</AppText>
          <AppText style={preferenceStyles.promptText}>
            לייקים, שמירות ופתיחת המלצות משפרים את סדר התוצאות. אפשר לאפס את הלמידה בכל עת.
          </AppText>
        </View>

        {hasPasswordProvider ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('ChangePassword')}
            testID="settings-change-password-button"
          >
            <AppText style={styles.primaryBtnText}>שינוי סיסמה</AppText>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Terms')}
          testID="settings-terms-button"
        >
          <AppText style={styles.primaryBtnText}>תנאי שימוש</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Privacy')}
          testID="settings-privacy-button"
        >
          <AppText style={styles.primaryBtnText}>מדיניות פרטיות</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('CommunityGuidelines')}
          testID="settings-community-guidelines-button"
        >
          <AppText style={styles.primaryBtnText}>כללי הקהילה</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, styles.dangerButton]}
          activeOpacity={0.9}
          onPress={deleteAccount}
          disabled={deleting}
          testID="settings-delete-account-button"
        >
          {deleting
            ? <ActivityIndicator color="#FFFFFF" />
            : <AppText style={styles.primaryBtnText}>מחיקת חשבון</AppText>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
