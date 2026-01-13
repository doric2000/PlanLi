import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../../config/firebase';
import { forms } from '../../../styles';
import { getUserTier } from '../../../utils/userTier';

export default function VerifyEmailScreen({ navigation }) {
  const [submitting, setSubmitting] = useState(false);

  const authUser = auth.currentUser;
  const tier = useMemo(() => getUserTier(authUser), [authUser]);

  const handleResend = useCallback(async () => {
    if (!auth.currentUser) {
      Alert.alert('שגיאה', 'יש להתחבר כדי לשלוח אימייל אימות.');
      navigation.replace('Login');
      return;
    }

    setSubmitting(true);
    try {
      await sendEmailVerification(auth.currentUser);
      Alert.alert('נשלח!', 'שלחנו לך אימייל אימות. בדוק/י גם בספאם.');
    } catch (e) {
      Alert.alert('שגיאה', e?.message || 'לא הצלחנו לשלוח אימייל אימות.');
    } finally {
      setSubmitting(false);
    }
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    if (!auth.currentUser) {
      navigation.replace('Login');
      return;
    }

    setSubmitting(true);
    try {
      await auth.currentUser.reload();
      if (getUserTier(auth.currentUser) === 'verified') {
        Alert.alert('מעולה!', 'האימייל אומת בהצלחה.');
        navigation.replace('Main');
      } else {
        Alert.alert('עדיין לא מאומת', 'פתח/י את האימייל ולחץ/י על הקישור ואז נסה/י שוב.');
      }
    } catch (e) {
      Alert.alert('שגיאה', e?.message || 'לא הצלחנו לרענן סטטוס אימות.');
    } finally {
      setSubmitting(false);
    }
  }, [navigation]);

  return (
    <LinearGradient colors={['#1E3A8A', '#3B82F6']} style={forms.authContainer}>
      <SafeAreaView style={forms.authSafeArea}>
        <View style={[forms.authCard, { paddingVertical: 28 }]}>
          <Text style={forms.authTitle}>אימות אימייל</Text>
          <Text style={forms.authSubtitle}>
            כדי לפתוח את כל הפיצ׳רים (תגובות, שמירה, יצירה/עריכה), צריך לאמת את האימייל.
          </Text>

          <View style={{ height: 16 }} />

          <View style={{ gap: 12 }}>
            <TouchableOpacity onPress={handleResend} activeOpacity={0.8} disabled={submitting}>
              <LinearGradient
                colors={['#1E3A8A', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={forms.authButton}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={forms.authButtonText}>שלח אימייל אימות שוב</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRefresh}
              activeOpacity={0.8}
              style={[forms.authSecondaryButton, { borderColor: 'rgba(255,255,255,0.35)' }]}
              disabled={submitting}
            >
              <Text style={forms.authSecondaryButtonText}>רענן סטטוס</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.replace('Main')}
              activeOpacity={0.8}
              style={[forms.authSecondaryButton, { borderColor: 'rgba(255,255,255,0.35)' }]}
            >
              <Text style={forms.authSecondaryButtonText}>
                {tier === 'unverified' ? 'המשך לאפליקציה (מוגבל)' : 'המשך לאפליקציה'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
