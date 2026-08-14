import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { authStyles } from '../../../styles';
import { sendResetEmail } from '../../../services/AuthService';
import AuthLayout from '../components/AuthLayout';
import BrandWordmark from '../components/BrandWordmark';

export default function ResetEmailSentScreen({ navigation, route }) {
  const email = route?.params?.email || '';
  const [seconds, setSeconds] = useState(45);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  const resend = async () => {
    if (seconds > 0 || !email) return;
    setSending(true);
    try { await sendResetEmail(email); setSeconds(45); } finally { setSending(false); }
  };
  return (
    <AuthLayout testID="reset-email-sent-screen" keyboard={false}>
      <BrandWordmark compact />
      <View style={authStyles.statusIcon}><Ionicons name="mail-outline" size={34} color="#F5961D" /></View>
      <AppText style={[authStyles.title, authStyles.centeredTitle]}>בדקו את תיבת הדואר</AppText>
      <AppText style={[authStyles.subtitle, authStyles.centeredText]}>אם קיים חשבון לכתובת שהוזנה, נשלח אליה קישור לאיפוס הסיסמה.</AppText>
      <TouchableOpacity style={authStyles.primaryButton} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}><AppText style={authStyles.primaryButtonText}>חזרה להתחברות</AppText></TouchableOpacity>
      <TouchableOpacity style={authStyles.textButton} onPress={resend} disabled={seconds > 0 || sending} testID="resend-reset-link">
        {sending ? <ActivityIndicator color="#1E3A5F" /> : <AppText style={authStyles.textButtonText}>{seconds > 0 ? `שליחה חוזרת בעוד 00:${String(seconds).padStart(2, '0')}` : 'שליחה חוזרת'}</AppText>}
      </TouchableOpacity>
      <TouchableOpacity style={authStyles.textButton} onPress={() => navigation.replace('ForgotPassword')}><AppText style={authStyles.textButtonText}>שינוי כתובת</AppText></TouchableOpacity>
    </AuthLayout>
  );
}
