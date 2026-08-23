import React, { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { authStyles } from '../../../styles';
import {
  formatAuthError,
  signInWithEmail,
} from '../../../services/AuthService';
import AuthFormLayout from '../components/AuthFormLayout';
import BrandWordmark from '../components/BrandWordmark';
import { leaveAuthFlow, resetToMain } from '../../../navigation/authNavigation';
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

  return (
    <AuthFormLayout
      testID="login-screen"
      onBack={handleBack}
      header={({ compact }) => (
        <>
          <View style={authStyles.formBrand} testID="auth-form-brand"><BrandWordmark form /></View>
          <AppText style={[authStyles.formTitle, compact && authStyles.formTitleCompact]}>ברוכים השבים</AppText>
          <AppText style={authStyles.formSubtitle}>התחברו והמשיכו לתכנן את הטיול הבא.</AppText>
        </>
      )}
    >
      {({ compact }) => (
        <>
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
              embeddedLabel
              showLeadingIcon={false}
              compact={compact}
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
              embeddedLabel
              showLeadingIcon={false}
              compact={compact}
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
          <View style={[authStyles.footerRow, authStyles.formFooterRow]} testID="auth-form-footer">
            <AppText style={authStyles.footerText}>אין חשבון? </AppText>
            <TouchableOpacity onPress={() => navigation.replace('Register')}><AppText style={authStyles.link}>הרשמה</AppText></TouchableOpacity>
          </View>
        </>
      )}
    </AuthFormLayout>
  );
}
