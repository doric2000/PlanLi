import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { authStyles } from '../../../styles';
import {
  ensureAuthenticatedUserProfile,
  formatAuthError,
  isProviderCancellation,
  normalizeEmail,
  registerWithEmail,
  signInWithApple,
  signInWithGoogle,
  validateNewPassword,
} from '../../../services/AuthService';
import AuthLayout from '../components/AuthLayout';
import BrandWordmark from '../components/BrandWordmark';
import LegalConsent from '../components/LegalConsent';
import { SocialLoginButtons } from '../components/SocialLoginButtons';

export default function RegisterScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const strength = useMemo(() => Math.min(100, Math.round((password.length / 14) * 100)), [password]);

  const handleRegister = async () => {
    const displayName = fullName.trim();
    if (displayName.length < 2) return setError('יש להזין שם מלא באורך של לפחות שני תווים.');
    if (!normalizeEmail(email) || !normalizeEmail(email).includes('@')) return setError('יש להזין כתובת אימייל תקינה.');
    if (password !== confirmPassword) return setError('הסיסמאות אינן תואמות.');
    if (!acceptedLegal) return setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות.');
    setLoading(true);
    setError('');
    try {
      const policy = await validateNewPassword(password);
      if (!policy.isValid) return setError(policy.message);
      await registerWithEmail({ displayName, email, password, acceptedLegal });
      navigation.reset({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    } catch (registrationError) {
      setError(formatAuthError(registrationError));
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider) => {
    setLoading(true);
    setError('');
    try {
      const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      await ensureAuthenticatedUserProfile(result.user, result.profile);
      navigation.reset({ index: 0, routes: [{ name: 'CompleteAccount' }] });
    } catch (socialError) {
      if (!isProviderCancellation(socialError)) setError(formatAuthError(socialError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout testID="register-screen">
      <BrandWordmark compact />
      <AppText style={authStyles.title}>יוצאים לדרך</AppText>
      <AppText style={authStyles.subtitle}>כמה פרטים קצרים והחשבון מוכן.</AppText>
      <AuthInput label="שם מלא" value={fullName} onChangeText={setFullName} placeholder="הזינו את שמכם המלא" iconName="person-outline" autoCapitalize="words" />
      <AuthInput label="אימייל" value={email} onChangeText={setEmail} placeholder="הזינו כתובת אימייל" iconName="mail-outline" keyboardType="email-address" />
      <AuthInput label="סיסמה" value={password} onChangeText={setPassword} placeholder="לפחות 10 תווים" iconName="lock-closed-outline" isPassword />
      <View style={authStyles.strengthTrack} accessibilityLabel={`חוזק סיסמה ${strength} אחוז`}><View style={[authStyles.strengthFill, { width: `${strength}%` }]} /></View>
      <AuthInput label="אימות סיסמה" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="הזינו שוב את הסיסמה" iconName="lock-closed-outline" isPassword />
      <LegalConsent accepted={acceptedLegal} onChange={setAcceptedLegal} navigation={navigation} disabled={loading} />
      {error ? <AppText style={authStyles.error} testID="auth-error">{error}</AppText> : null}
      <TouchableOpacity style={[authStyles.primaryButton, loading && authStyles.primaryButtonDisabled]} onPress={handleRegister} disabled={loading} testID="email-register-button">
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>יצירת חשבון</AppText>}
      </TouchableOpacity>
      {Platform.OS !== 'web' ? (
        <><View style={authStyles.dividerRow}><View style={authStyles.divider} /><AppText style={authStyles.dividerText}>או</AppText><View style={authStyles.divider} /></View>
          <SocialLoginButtons mode="register" onGoogleLogin={() => handleSocial('google')} onAppleLogin={() => handleSocial('apple')} disabled={loading} /></>
      ) : null}
      <View style={authStyles.footerRow}><AppText style={authStyles.footerText}>כבר יש חשבון? </AppText><TouchableOpacity onPress={() => navigation.replace('Login')}><AppText style={authStyles.link}>התחברות</AppText></TouchableOpacity></View>
    </AuthLayout>
  );
}
