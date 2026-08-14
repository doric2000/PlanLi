import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';

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

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const finishAuthentication = async ({ user, profile }) => {
    const { routeName } = await completeAuthentication(user, profile);
    navigation.reset({ index: 0, routes: [{ name: routeName }] });
  };

  const handleLogin = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      setError('יש להזין אימייל וסיסמה.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await finishAuthentication({ user: credential.user });
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
      await finishAuthentication(result);
    } catch (socialError) {
      if (!isProviderCancellation(socialError)) setError(formatAuthError(socialError));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError('הזינו את כתובת האימייל בשדה למעלה ואז לחצו שוב על שכחת סיסמה.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      auth.languageCode = 'he';
      await sendPasswordResetEmail(auth, normalizedEmail);
      Alert.alert('המייל נשלח', 'שלחנו אליכם קישור לאיפוס הסיסמה. בדקו גם את תיקיית הספאם.');
    } catch (resetError) {
      setError(formatAuthError(resetError));
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
                <AppText style={forms.authTitle}>ברוכים השבים</AppText>
                <AppText style={forms.authSubtitle}>כדי להמשיך לתכנן, עליכם להתחבר</AppText>
              </View>

              <View style={forms.authForm}>
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
                <TouchableOpacity
                  style={forms.authForgotPassword}
                  onPress={handleForgotPassword}
                  disabled={loading}
                  testID="forgot-password-button"
                >
                  <AppText style={forms.authForgotPasswordText}>שכחתם סיסמה?</AppText>
                </TouchableOpacity>

                {error ? <AppText style={forms.authErrorText} testID="auth-error">{error}</AppText> : null}

                <TouchableOpacity
                  onPress={handleLogin}
                  activeOpacity={0.8}
                  disabled={loading}
                  testID="email-login-button"
                >
                  <LinearGradient
                    colors={['#1E3A8A', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={forms.authButton}
                  >
                    {loading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <AppText style={forms.authButtonText}>התחברו</AppText>}
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
                      onGoogleLogin={() => handleSocialLogin('google')}
                      onAppleLogin={() => handleSocialLogin('apple')}
                      disabled={loading}
                    />
                  </>
                ) : null}

                <View style={forms.authFooter}>
                  <View style={forms.authLinkContainer}>
                    <AppText style={forms.authLinkText}>אין לכם חשבון? </AppText>
                    <TouchableOpacity
                      onPress={() => navigation.replace('Register')}
                      disabled={loading}
                    >
                      <AppText style={forms.authLink}>הירשמו</AppText>
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
