import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import AppText from "../../../components/AppText";
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../../../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { forms } from '../../../styles';
import { AuthInput } from '../../../components/AuthInput';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useRegisterOrUpdateUser } from '../../../hooks/useRegisterOrUpdateUser';
import { useGoogleLogin } from '../../../hooks/useGoogleLogin';
import { getUserTier } from '../../../utils/userTier';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }) {
  const registerOrUpdateUser = useRegisterOrUpdateUser();
  const handleGoogleResponse = useGoogleLogin(navigation.replace);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // --- CONFIGURATION ---
  // 1. Enter your exact Expo username here (check expo.dev)
  const EXPO_USERNAME = 'doric2000'; 
  // 2. Enter your slug from app.json
  const EXPO_SLUG = 'client';
  
  // This constructs: https://auth.expo.io/@doric2000/client
  const PROXY_URL = `https://auth.expo.io/@${EXPO_USERNAME}/${EXPO_SLUG}`;

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID, 
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID, 
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    responseType: "id_token",
    
    // 3. FORCE THE URL
    // If we are on mobile, we DO NOT use makeRedirectUri. We force the string.
    redirectUri: Platform.OS === 'web' ? undefined : PROXY_URL
  });

  useEffect(() => {
    if (response) {
      if (response.type === 'error') {
        setError("Google Sign-In Error: " + (response.params?.error_description || "Unknown error"));
        return;
      }
      if (response.type === 'success') {
        handleGoogleResponse(response).catch((err) => setError(err.message));
      }
    }
  }, [response]);

  const handleLogin = async () => {
    try {
      setError('');
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const tier = getUserTier(cred?.user);
      if (tier === 'unverified') {
        navigation.replace('VerifyEmail');
      } else {
        navigation.reset({index: 0,routes: [{ name: 'Main' }] });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = () => {
    if (Platform.OS === 'web') {
      promptAsync();
    } else {
      // 4. FORCE THE PROXY AGAIN
      // We pass the URL here explicitly to override any defaults
      promptAsync({ 
        useProxy: true,
        redirectUri: PROXY_URL
      });
    }
  };

  return (
    <LinearGradient colors={['#1E3A8A', '#3B82F6']} style={forms.authContainer}>
      {/* ... (Your UI code remains exactly the same) ... */}
      <SafeAreaView style={forms.authSafeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={forms.authKeyboardView}>
          <ScrollView contentContainerStyle={forms.authScrollContent} showsVerticalScrollIndicator={false}>
            <View style={forms.authCard}>
              <View style={forms.authHeader}>
                <View style={forms.authLogoContainer}>
                  <Image source={require('../../../../assets/logo.png')} style={forms.authLogo} resizeMode="contain"/>
                </View>
                <AppText style={forms.authTitle}>ברוכים השבים</AppText>
                <AppText style={forms.authSubtitle}>כדי להמשיך לתכנן, עליך להתחבר</AppText>
              </View>

              <View style={forms.authForm}>
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
                <TouchableOpacity style={forms.authForgotPassword}>
                  <AppText style={forms.authForgotPasswordText}>שכחת סיסמה?</AppText>
                </TouchableOpacity>
                {error ? <AppText style={forms.authErrorText}>{error}</AppText> : null}
                
                <TouchableOpacity onPress={handleLogin} activeOpacity={0.8}>
                  <LinearGradient colors={['#1E3A8A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={forms.authButton}>
                    <AppText style={forms.authButtonText}>התחבר</AppText>
                  </LinearGradient>
                </TouchableOpacity>

                <View style={forms.authDividerContainer}>
                  <View style={forms.authDivider} />
                  <AppText style={forms.authDividerText}>או המשך/י באמצעות</AppText>
                  <View style={forms.authDivider} />
                </View>

                <SocialLoginButtons onGoogleLogin={handleGoogleLogin} />

                <View style={forms.authFooter}>
                  <View style={forms.authLinkContainer}>
                    <AppText style={forms.authLinkText}> אין לך חשבון? </AppText>
                    <TouchableOpacity onPress={() => navigation.replace('Register')}>
                      <AppText style={forms.authLink}>הירשם/י</AppText>
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