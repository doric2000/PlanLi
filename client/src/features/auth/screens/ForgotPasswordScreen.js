import React, { useState } from 'react';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { authStyles } from '../../../styles';
import { formatAuthError, normalizeEmail, sendResetEmail } from '../../../services/AuthService';
import AuthLayout from '../components/AuthLayout';
import BrandWordmark from '../components/BrandWordmark';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) return setError('יש להזין כתובת אימייל תקינה.');
    setLoading(true); setError('');
    try {
      await sendResetEmail(normalized);
      navigation.replace('ResetEmailSent', { email: normalized });
    } catch (sendError) {
      setError(formatAuthError(sendError));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout testID="forgot-password-screen">
      <BrandWordmark compact />
      <AppText style={authStyles.title}>איפוס סיסמה</AppText>
      <AppText style={authStyles.subtitle}>נשלח קישור מאובטח למייל. מטעמי פרטיות התשובה זהה בין אם קיים חשבון ובין אם לא.</AppText>
      <AuthInput label="כתובת אימייל" value={email} onChangeText={setEmail} placeholder="name@example.com" iconName="mail-outline" keyboardType="email-address" testID="reset-email-input" />
      {error ? <AppText style={authStyles.error}>{error}</AppText> : null}
      <TouchableOpacity style={authStyles.primaryButton} onPress={send} disabled={loading} testID="send-reset-link">
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>שליחת קישור</AppText>}
      </TouchableOpacity>
      <TouchableOpacity style={authStyles.textButton} onPress={() => navigation.replace('Login')}><AppText style={authStyles.textButtonText}>חזרה להתחברות</AppText></TouchableOpacity>
    </AuthLayout>
  );
}
