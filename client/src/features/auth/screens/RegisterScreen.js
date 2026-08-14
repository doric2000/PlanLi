import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';

import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { auth } from '../../../config/firebase';
import { forms } from '../../../styles';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import {
  completeAuthentication,
  formatAuthError,
  isProviderCancellation,
  normalizeEmail,
  signInWithApple,
  signInWithGoogle,
} from '../../../services/AuthService';

export default function RegisterScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const finishAuthentication = async ({ user, profile }) => {
    const { routeName } = await completeAuthentication(user, profile);
    navigation.reset({ index: 0, routes: [{ name: routeName }] });
  };

  const handleRegister = async () => {
    const normalizedName = fullName.trim();
    const normalizedEmail = normalizeEmail(email);
    if (normalizedName.length < 2) {
      setError('יש להזין שם באורך של לפחות שני תווים.');
      return;
    }
    if (!normalizedEmail) {
      setError('יש להזין כתובת אימייל תקינה.');
      return;
    }
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }
    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const pendingPasswordUser = auth.currentUser &&
        normalizeEmail(auth.currentUser.email) === normalizedEmail &&
        auth.currentUser.providerData?.some((provider) => provider.providerId === 'password')
        ? auth.currentUser
        : null;
      const user = pendingPasswordUser || (
        await createUserWithEmailAndPassword(auth, normalizedEmail, password)
      ).user;
      await updateProfile(user, { displayName: normalizedName });
      await completeAuthentication(user, {
        displayName: normalizedName,
        photoURL: null,
      });
      auth.languageCode = 'he';
      try {
        await sendEmailVerification(user);
      } catch (verificationError) {
        console.warn('sendEmailVerification failed:', verificationError?.message || verificationError);
      }
      navigation.reset({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    } catch (registrationError) {
      setError(formatAuthError(registrationError));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialRegister = async (provider) => {
    setLoading(true);
    setError('');
    try {
      const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      await finishAuthentication(result);
    } catch (socialError) {
      if (!isProviderCancellation(socialError)) setError(formatAuthError(socialError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#1E3A8A', '#3B82F6']} style={forms.authContainer}>
      <SafeAreaView style={forms.authSafeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={forms.authKeyboardView}
        >
          <ScrollView contentContainerStyle={forms.authScrollContent} showsVerticalScrollIndicator={false}>
            <View style={forms.authCard}>
              <View style={forms.authHeader}>
                <View style={forms.authLogoContainer}>
                  <Image
                    source={require('../../../../assets/logo.png')}
                    style={forms.authLogo}
                    resizeMode="contain"
                  />
                </View>
                <AppText style={forms.authTitle}>צרו חשבון</AppText>
                <AppText style={forms.authSubtitle}>התחילו את המסע שלכם</AppText>
              </View>

              <View style={forms.authForm}>
                <AuthInput
                  label="שם מלא"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="הזינו את שמכם המלא"
                  iconName="person-outline"
                  autoCapitalize="words"
                />
                <AuthInput
                  label="אימייל"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="הזינו כתובת אימייל"
                  iconName="mail-outline"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <AuthInput
                  label="סיסמה"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="הזינו סיסמה"
                  iconName="lock-closed-outline"
                  isPassword
                />
                <AuthInput
                  label="אימות סיסמה"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="הזינו שוב את הסיסמה"
                  iconName="lock-closed-outline"
                  isPassword
                />

                <View style={forms.authTermsContainer}>
                  <AppText style={forms.authTermsText}>
                    בהרשמה למערכת אתם מאשרים את תנאי השימוש ומדיניות הפרטיות
                  </AppText>
                </View>

                {error ? <AppText style={forms.authErrorText} testID="auth-error">{error}</AppText> : null}

                <TouchableOpacity
                  onPress={handleRegister}
                  activeOpacity={0.8}
                  disabled={loading}
                  testID="email-register-button"
                >
                  <LinearGradient
                    colors={['#1E3A8A', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={forms.authButton}
                  >
                    {loading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <AppText style={forms.authButtonText}>צרו חשבון</AppText>}
                  </LinearGradient>
                </TouchableOpacity>

                {Platform.OS === 'ios' ? (
                  <>
                    <View style={forms.authDividerContainer}>
                      <View style={forms.authDivider} />
                      <AppText style={forms.authDividerText}>או המשיכו באמצעות</AppText>
                      <View style={forms.authDivider} />
                    </View>
                    <SocialLoginButtons
                      mode="register"
                      onGoogleLogin={() => handleSocialRegister('google')}
                      onAppleLogin={() => handleSocialRegister('apple')}
                      disabled={loading}
                    />
                  </>
                ) : null}

                <View style={forms.authFooter}>
                  <AppText style={forms.authFooterText}>הצטרפו למטיילים שמגלים את העולם יחד</AppText>
                  <View style={forms.authLinkContainer}>
                    <AppText style={forms.authLinkText}>כבר יש לכם חשבון? </AppText>
                    <TouchableOpacity
                      onPress={() => navigation.replace('Login')}
                      disabled={loading}
                    >
                      <AppText style={forms.authLink}>התחברו</AppText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
