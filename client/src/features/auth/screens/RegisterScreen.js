import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../../../config/firebase';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { useRegisterOrUpdateUser } from '../../../hooks/useRegisterOrUpdateUser';
import { useGoogleLogin } from '../../../hooks/useGoogleLogin';
import { forms } from '../../../styles';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

// --- Import the new Modular Components ---
import { AuthInput } from '../../../components/AuthInput';
import { SocialLoginButtons } from '../components/SocialLoginButtons';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen({ navigation }) {
  const registerOrUpdateUser = useRegisterOrUpdateUser();
  const navigateAfterGoogle = useCallback(
    (routeName) => navigation.replace(routeName),
    [navigation]
  );
  const handleGoogleResponse = useGoogleLogin(navigateAfterGoogle);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const proxyUrl = 'https://auth.expo.io/@doric2000/client';
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    responseType: 'id_token',
    redirectUri: Platform.OS === 'web' ? undefined : proxyUrl,
  });

  useEffect(() => {
    if (response?.type === 'error') {
      setError(response.params?.error_description || 'Google Sign-In Error');
    } else if (response?.type === 'success') {
      handleGoogleResponse(response).catch((googleError) => setError(googleError.message));
    }
  }, [handleGoogleResponse, response]);

  const handleGoogleRegister = () => promptAsync(
    Platform.OS === 'web' ? undefined : { useProxy: true, redirectUri: proxyUrl }
  );

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setError('');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: fullName });
        await registerOrUpdateUser(userCredential.user, { displayName: fullName, photoURL: null });

        // Send verification email for password accounts
        try {
          await sendEmailVerification(userCredential.user);
        } catch (e) {
          // Don't block registration flow if email sending fails
          console.warn('sendEmailVerification failed:', e?.message || e);
        }
      }
      navigation.replace('VerifyEmail');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <LinearGradient colors={['#1E3A8A', '#3B82F6']} style={forms.authContainer}>
      <SafeAreaView style={forms.authSafeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={forms.authKeyboardView}>
          <ScrollView contentContainerStyle={forms.authScrollContent} showsVerticalScrollIndicator={false}>

            <View style={forms.authCard}>
              {/* Header */}
              <View style={forms.authHeader}>
                <View style={forms.authLogoContainer}>
                   <Image source={require('../../../../assets/logo.png')} style={forms.authLogo} resizeMode="contain" />
                </View>
                <Text style={forms.authTitle}>צרו חשבון</Text>
                <Text style={forms.authSubtitle}>התחילו את המסע שלכם</Text>
              </View>

              <View style={forms.authForm}>
                
                {/* --- Reusable Inputs --- */}
                <AuthInput
                  label="שם מלא"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="הזן/י את שמך המלא"
                  iconName="person-outline"
                  autoCapitalize="words"
                />

                <AuthInput
                  label="אימייל"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="הזן/י כתובת אימייל"
                  iconName="mail-outline"
                  keyboardType="email-address"
                />

                <AuthInput
                  label="סיסמה"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="הזן/י סיסמה"
                  iconName="lock-closed-outline"
                  isPassword={true}
                />

                <AuthInput
                  label="אימות סיסמה"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="אימות סיסמה"
                  iconName="lock-closed-outline"
                  isPassword={true}
                />

                {/* Terms Text */}
                <View style={forms.authTermsContainer}>
                  <Text style={forms.authTermsText}>
                    בהרשמה למערכת, הנך מאשר/ת את{' '}
                    <Text style={forms.authTermsLink}>תנאי השימוש</Text> &{' '}
                    <Text style={forms.authTermsLink}>מדיניות הפרטיות</Text>
                  </Text>
                </View>

                {error ? <Text style={forms.authErrorText}>{error}</Text> : null}

                {/* Register Button */}
                <TouchableOpacity onPress={handleRegister} activeOpacity={0.8}>
                  <LinearGradient colors={['#1E3A8A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={forms.authButton}>
                    <Text style={forms.authButtonText}>צור חשבון</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Divider */}
                <View style={forms.authDividerContainer}>
                  <View style={forms.authDivider} />
                  <Text style={forms.authDividerText}>או המשך/י באמצעות</Text>
                  <View style={forms.authDivider} />
                </View>

                {/* --- Reusable Social Buttons --- */}
                <SocialLoginButtons onGoogleLogin={request ? handleGoogleRegister : undefined} />

                {/* Footer */}
                <View style={forms.authFooter}>
                  <Text style={forms.authFooterText}>הצטרף לאלפי מטיילים</Text>
                  <Text style={forms.authFooterText}>מגלים את העולם ביחד</Text>

                  <View style={forms.authLinkContainer}>
                    <Text style={forms.authLinkText}>כבר יש לך חשבון? </Text>
                    <TouchableOpacity onPress={() => navigation.replace('Login')}>
                      <Text style={forms.authLink}>התחבר/י</Text>
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
