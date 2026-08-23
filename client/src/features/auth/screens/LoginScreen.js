import React, { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, TouchableOpacity, View } from 'react-native';
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
import AuthFormLayout from '../components/AuthFormLayout';
import BrandWordmark from '../components/BrandWordmark';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { leaveAuthFlow, resetToMain, resetToRootRoute } from '../../../navigation/authNavigation';
import { useAuth } from '../AuthContext';

export default function LoginScreen({ navigation, route }) {
  const { clearPendingReturn, runAuthTransition } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);

  const complete = () => resetToMain(navigation);
  const handleBack = () => {
    clearPendingReturn();
    leaveAuthFlow(navigation, route?.params?.fallbackTab);
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password) return setError('יש להזין אימייל וסיסמה.');
    setLoading(true);
    setError('');
    try {
      await runAuthTransition(async () => {
        await signInWithEmail(email, password);
        complete();
      }, 'sign_in_email');
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
      await runAuthTransition(async () => {
        const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
        const bootstrap = await ensureAuthenticatedUserProfile(result.user, result.profile);
        if (bootstrap?.created) resetToRootRoute(navigation, 'CompleteAccount');
        else complete();
      }, provider === 'apple' ? 'sign_in_apple' : 'sign_in_google');
    } catch (socialError) {
      if (!isProviderCancellation(socialError)) setError(formatAuthError(socialError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormLayout testID="login-screen" onBack={handleBack}>
      {({ compact, keyboardVisible }) => (
        <>
          {!keyboardVisible ? <View style={authStyles.formBrand} testID="auth-form-brand"><BrandWordmark form /></View> : null}
          {!keyboardVisible ? <AppText style={[authStyles.formTitle, compact && authStyles.formTitleCompact]}>ברוכים השבים</AppText> : null}
          {!keyboardVisible ? <AppText style={authStyles.formSubtitle}>התחברו והמשיכו לתכנן את הטיול הבא.</AppText> : null}
          <View style={authStyles.formFields}>
            <AuthInput
              label="אימייל"
              value={email}
              onChangeText={setEmail}
              placeholder="הזינו כתובת אימייל"
              iconName="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              contentDirection="ltr"
              compact={compact}
              hideLabel={keyboardVisible}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="login-email"
            />
            <AuthInput
              ref={passwordRef}
              label="סיסמה"
              value={password}
              onChangeText={setPassword}
              placeholder="הזינו סיסמה"
              iconName="lock-closed-outline"
              isPassword
              compact={compact}
              hideLabel={keyboardVisible}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              testID="login-password"
            />
          </View>
          <TouchableOpacity style={authStyles.linkButton} onPress={() => navigation.navigate('ForgotPassword')}>
            <AppText style={authStyles.link}>שכחתי סיסמה</AppText>
          </TouchableOpacity>
          <View style={authStyles.formErrorSlot} testID="auth-error-slot">
            {error ? <AppText style={[authStyles.error, authStyles.formError]} testID="auth-error">{error}</AppText> : null}
          </View>
          <TouchableOpacity style={[authStyles.primaryButton, authStyles.formPrimaryButton, loading && authStyles.primaryButtonDisabled]}
            onPress={handleLogin} disabled={loading} testID="email-login-button">
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>התחברות</AppText>}
          </TouchableOpacity>
          {!keyboardVisible && Platform.OS !== 'web' ? (
            <>
              <View style={[authStyles.dividerRow, authStyles.formDividerRow]}><View style={authStyles.divider} /><AppText style={authStyles.dividerText}>או</AppText><View style={authStyles.divider} /></View>
              <SocialLoginButtons compact onGoogleLogin={() => handleSocialLogin('google')} onAppleLogin={() => handleSocialLogin('apple')} disabled={loading} />
            </>
          ) : null}
          {!keyboardVisible ? (
            <View style={[authStyles.footerRow, authStyles.formFooterRow]} testID="auth-form-footer">
              <AppText style={authStyles.footerText}>אין חשבון? </AppText>
              <TouchableOpacity onPress={() => navigation.replace('Register')}><AppText style={authStyles.link}>הרשמה</AppText></TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </AuthFormLayout>
  );
}
