import React, { useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { authStyles } from '../../../styles';
import { useAuth } from '../AuthContext';
import { formatAuthError, refreshAuthenticatedUser, resendVerificationEmail, signOutCentral } from '../../../services/AuthService';
import AuthLayout from '../components/AuthLayout';
import BrandWordmark from '../components/BrandWordmark';

export default function VerifyEmailScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (operation) => {
    setLoading(true); setMessage('');
    try { await operation(); } catch (error) { setMessage(formatAuthError(error)); } finally { setLoading(false); }
  };
  const refresh = () => run(async () => {
    const current = await refreshAuthenticatedUser();
    if (current?.emailVerified) navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    else setMessage('האימייל עדיין לא אומת. פתחו את הקישור שקיבלתם ונסו שוב.');
  });
  return (
    <AuthLayout testID="verify-email-screen" keyboard={false}>
      <BrandWordmark compact />
      <View style={authStyles.statusIcon}><Ionicons name="mail-unread-outline" size={32} color="#F5961D" /></View>
      <AppText style={[authStyles.title, authStyles.centeredTitle]}>אמתו את כתובת האימייל</AppText>
      <AppText style={[authStyles.subtitle, authStyles.centeredText]}>שלחנו קישור מאובטח לכתובת:</AppText>
      <AppText style={authStyles.email}>{user?.email || ''}</AppText>
      {message ? <AppText style={authStyles.error}>{message}</AppText> : null}
      <TouchableOpacity style={authStyles.primaryButton} onPress={refresh} disabled={loading} testID="verify-email-refresh">
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>כבר אימתתי — רענון</AppText>}
      </TouchableOpacity>
      <TouchableOpacity style={authStyles.secondaryButton} onPress={() => run(resendVerificationEmail)} disabled={loading} testID="verify-email-resend"><AppText style={authStyles.secondaryButtonText}>שליחה חוזרת</AppText></TouchableOpacity>
      <TouchableOpacity style={authStyles.textButton} onPress={() => navigation.replace('Main', { allowUnverified: true })}><AppText style={authStyles.textButtonText}>המשך לגלישה ציבורית</AppText></TouchableOpacity>
      <View style={authStyles.utilityRow}>
        <TouchableOpacity style={authStyles.utilityLink} onPress={() => run(async () => { await signOutCentral(); navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); })}><AppText style={authStyles.utilityText}>התנתקות</AppText></TouchableOpacity>
        <TouchableOpacity style={authStyles.utilityLink} onPress={() => navigation.navigate('Settings')}><AppText style={authStyles.utilityText}>מחיקת חשבון</AppText></TouchableOpacity>
      </View>
    </AuthLayout>
  );
}
