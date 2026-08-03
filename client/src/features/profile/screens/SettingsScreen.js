import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import { auth } from '../../../config/firebase';
import { requestAccountDeletion } from '../../../services/SocialService';
import { resetPersonalizationActivity } from '../../../services/PersonalizationService';
import { preferenceSetupStyles as preferenceStyles, settingsScreenStyles as styles } from '../../../styles';

export default function SettingsScreen({ navigation }) {
  const [deleting, setDeleting] = useState(false);
  const [resettingPersonalization, setResettingPersonalization] = useState(false);

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

  const deleteAccount = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('למחוק לצמיתות את החשבון ואת כל התוכן שלו?')
      : await new Promise((resolve) => Alert.alert(
          'מחיקת חשבון',
          'החשבון, התוכן, המועדפים והתמונות יימחקו לצמיתות.',
          [
            { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
            { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
          ]
        ));
    if (!confirmed) return;

    setDeleting(true);
    try {
      await requestAccountDeletion();
      await signOut(auth);
    } catch (error) {
      Alert.alert(
        'לא ניתן למחוק את החשבון',
        String(error?.code || '').includes('unauthenticated')
          ? 'מטעמי אבטחה יש להתנתק, להתחבר מחדש ואז לנסות שוב.'
          : (error?.message || 'אירעה שגיאה. נסו שוב מאוחר יותר.')
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} testID="settings-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.8}
          testID="settings-back-button"
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הגדרות</Text>
        <View style={styles.rightSpacer} />
      </View>

      <View style={styles.container}>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ChangeName')}
          testID="settings-change-name-button"
        >
          <Text style={styles.primaryBtnText}>שינוי שם</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={resetPersonalization}
          disabled={resettingPersonalization}
          testID="settings-reset-personalization-button"
        >
          {resettingPersonalization
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>איפוס התאמה אישית</Text>}
        </TouchableOpacity>

        <View style={preferenceStyles.promptCard}>
          <Text style={preferenceStyles.promptTitle}>התאמה אישית פעילה</Text>
          <Text style={preferenceStyles.promptText}>
            לייקים, שמירות ופתיחת המלצות משפרים את סדר התוצאות. נשמרים ציונים מצומצמים בלבד, ואפשר לאפס אותם בכל עת.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <Text style={styles.primaryBtnText}>שינוי סיסמה</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: '#B42318' }]}
          activeOpacity={0.9}
          onPress={deleteAccount}
          disabled={deleting}
          testID="settings-delete-account-button"
        >
          {deleting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>מחיקת חשבון</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
