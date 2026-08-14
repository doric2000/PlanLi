import React, { useState } from 'react';
import { ActivityIndicator, Platform, TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { authStyles } from '../../../styles';
import {
  formatAuthError,
  isProviderCancellation,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  ensureAuthenticatedUserProfile,
} from '../../../services/AuthService';
import AuthLayout from '../components/AuthLayout';
import BrandWordmark from '../components/BrandWordmark';
import { SocialLoginButtons } from '../components/SocialLoginButtons';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const complete = () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] });

  const handleLogin = async () => {
    if (!email.trim() || !password) return setError('יש להזין אימייל וסיסמה.');
    setLoading(true);
    setError('');
    try {
      await signInWithEmail(email, password);
      complete();
    } catch (loginError) {
      setError(formatAuthError(loginError));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setLoading(true);
    setError('');
    try {
      const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      await ensureAuthenticatedUserProfile(result.user, result.profile);
      complete();
    } catch (socialError) {
      if (!isProviderCancellation(socialError)) setError(formatAuthError(socialError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout testID="login-screen">
      <BrandWordmark compact />
      <AppText style={authStyles.title}>ברוכים השבים</AppText>
      <AppText style={authStyles.subtitle}>התחברו והמשיכו לתכנן את הטיול הבא.</AppText>
      <AuthInput label="אימייל" value={email} onChangeText={setEmail} placeholder="הזינו כתובת אימייל"
        iconName="mail-outline" keyboardType="email-address" autoCapitalize="none" testID="login-email" />
      <AuthInput label="סיסמה" value={password} onChangeText={setPassword} placeholder="הזינו סיסמה"
        iconName="lock-closed-outline" isPassword testID="login-password" />
      <TouchableOpacity style={authStyles.linkButton} onPress={() => navigation.navigate('ForgotPassword')}>
        <AppText style={authStyles.link}>שכחתי סיסמה</AppText>
      </TouchableOpacity>
      {error ? <AppText style={authStyles.error} testID="auth-error">{error}</AppText> : null}
      <TouchableOpacity style={[authStyles.primaryButton, loading && authStyles.primaryButtonDisabled]}
        onPress={handleLogin} disabled={loading} testID="email-login-button">
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>התחברות</AppText>}
      </TouchableOpacity>
      {Platform.OS !== 'web' ? (
        <>
          <View style={authStyles.dividerRow}><View style={authStyles.divider} /><AppText style={authStyles.dividerText}>או</AppText><View style={authStyles.divider} /></View>
          <SocialLoginButtons onGoogleLogin={() => handleSocialLogin('google')} onAppleLogin={() => handleSocialLogin('apple')} disabled={loading} />
        </>
      ) : null}
      <View style={authStyles.footerRow}>
        <AppText style={authStyles.footerText}>אין חשבון? </AppText>
        <TouchableOpacity onPress={() => navigation.replace('Register')}><AppText style={authStyles.link}>הרשמה</AppText></TouchableOpacity>
      </View>
    </AuthLayout>
  );
}
