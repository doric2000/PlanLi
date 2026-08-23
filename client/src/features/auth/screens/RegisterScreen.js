import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { authStyles } from '../../../styles';
import {
  formatAuthError,
  normalizeEmail,
  registerWithEmail,
  validateNewPassword,
} from '../../../services/AuthService';
import AuthFormLayout from '../components/AuthFormLayout';
import BrandWordmark from '../components/BrandWordmark';
import LegalConsent from '../components/LegalConsent';
import { leaveAuthFlow, resetToRootRoute } from '../../../navigation/authNavigation';
import { useAuth } from '../AuthContext';
import {
  normalizeDisplayName,
  sanitizeDisplayNameInput,
  validateDisplayName,
} from '../utils/displayName';

export default function RegisterScreen({ navigation, route }) {
  const { clearPendingReturn, runAuthTransition } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const strength = useMemo(() => Math.min(100, Math.round((password.length / 14) * 100)), [password]);
  const handleBack = () => {
    clearPendingReturn();
    leaveAuthFlow(navigation, route?.params?.fallbackTab);
  };

  const handleRegister = async () => {
    const displayName = normalizeDisplayName(fullName);
    const displayNameError = validateDisplayName(displayName);
    if (displayNameError) return setError(displayNameError);
    if (!normalizeEmail(email) || !normalizeEmail(email).includes('@')) return setError('יש להזין כתובת אימייל תקינה.');
    if (password !== confirmPassword) return setError('הסיסמאות אינן תואמות.');
    if (!acceptedLegal) return setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות.');
    setLoading(true);
    setError('');
    try {
      const policy = await validateNewPassword(password);
      if (!policy.isValid) return setError(policy.message);
      await runAuthTransition(async () => {
        await registerWithEmail({ displayName, email, password, acceptedLegal });
        resetToRootRoute(navigation, 'VerifyEmail');
      }, 'register_email');
    } catch (registrationError) {
      setError(formatAuthError(registrationError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormLayout testID="register-screen" onBack={handleBack}>
      {({ compact, keyboardVisible }) => (
        <>
          {!keyboardVisible ? <View style={authStyles.formBrand} testID="auth-form-brand"><BrandWordmark form /></View> : null}
          {!keyboardVisible ? <AppText style={[authStyles.formTitle, compact && authStyles.formTitleCompact]}>יוצאים לדרך</AppText> : null}
          {!keyboardVisible ? <AppText style={authStyles.formSubtitle}>כמה פרטים קצרים והחשבון מוכן.</AppText> : null}
          <View style={authStyles.formFields}>
            <AuthInput
              label="שם מלא"
              value={fullName}
              onChangeText={(value) => setFullName(sanitizeDisplayNameInput(value))}
              placeholder="הזינו את שמכם המלא"
              iconName="person-outline"
              autoCapitalize="words"
              embeddedLabel
              showLeadingIcon={false}
              compact={compact}
              hideLabel={keyboardVisible}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emailRef.current?.focus()}
              testID="register-name"
            />
            <AuthInput
              ref={emailRef}
              label="אימייל"
              value={email}
              onChangeText={setEmail}
              placeholder="הזינו כתובת אימייל"
              iconName="mail-outline"
              keyboardType="email-address"
              contentDirection="ltr"
              embeddedLabel
              showLeadingIcon={false}
              compact={compact}
              hideLabel={keyboardVisible}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="register-email"
            />
            <AuthInput
              ref={passwordRef}
              label="סיסמה"
              value={password}
              onChangeText={setPassword}
              placeholder="לפחות 10 תווים"
              iconName="lock-closed-outline"
              isPassword
              embeddedLabel
              showLeadingIcon={false}
              compact={compact}
              hideLabel={keyboardVisible}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              testID="register-password"
            />
            <View style={[authStyles.strengthTrack, compact && authStyles.compactStrengthTrack]} accessibilityLabel={`חוזק סיסמה ${strength} אחוז`}><View style={[authStyles.strengthFill, { width: `${strength}%` }]} /></View>
            <AuthInput
              ref={confirmPasswordRef}
              label="אימות סיסמה"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="הזינו שוב את הסיסמה"
              iconName="lock-closed-outline"
              isPassword
              embeddedLabel
              showLeadingIcon={false}
              compact={compact}
              hideLabel={keyboardVisible}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              testID="register-confirm-password"
            />
          </View>
          <LegalConsent accepted={acceptedLegal} onChange={setAcceptedLegal} navigation={navigation} disabled={loading} compact={compact} />
          <View style={authStyles.formErrorSlot} testID="auth-error-slot">
            {error ? <AppText style={[authStyles.error, authStyles.formError]} testID="auth-error">{error}</AppText> : null}
          </View>
          <TouchableOpacity style={[authStyles.primaryButton, authStyles.formPrimaryButton, loading && authStyles.primaryButtonDisabled]} onPress={handleRegister} disabled={loading} testID="email-register-button">
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>יצירת חשבון</AppText>}
          </TouchableOpacity>
          {!keyboardVisible ? (
            <View style={[authStyles.footerRow, authStyles.formFooterRow]} testID="auth-form-footer"><AppText style={authStyles.footerText}>כבר יש חשבון? </AppText><TouchableOpacity onPress={() => navigation.replace('Login')}><AppText style={authStyles.link}>התחברות</AppText></TouchableOpacity></View>
          ) : null}
        </>
      )}
    </AuthFormLayout>
  );
}
