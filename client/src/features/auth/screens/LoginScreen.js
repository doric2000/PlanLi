
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../../../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { forms } from '../../../styles';
import { AuthInput } from '../../../components/AuthInput';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import * as Google from 'expo-auth-session/providers/google';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { makeRedirectUri } from 'expo-auth-session';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Google AuthSession setup
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    redirectUri: makeRedirectUri({
      scheme: 'planli',
      preferLocalhost: false, // <--- זו השורה הקריטית!
    }),
  });
  React.useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(() => {
          navigation.replace('Main');
        })
        .catch((err) => setError(err.message));
    }
  }, [response]);

  const handleLogin = async () => {
    try {
      setError('');
      await signInWithEmailAndPassword(auth, email, password);
      navigation.replace('Main');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = () => {
    promptAsync();
  };

  return (
    <LinearGradient colors={['#1E3A8A', '#3B82F6']} style={forms.authContainer}>
      <SafeAreaView style={forms.authSafeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={forms.authKeyboardView}>
          <ScrollView contentContainerStyle={forms.authScrollContent} showsVerticalScrollIndicator={false}>
            <View style={forms.authCard}>
              {/* Header - (You could even componentize this!) */}
              <View style={forms.authHeader}>
                <View style={forms.authLogoContainer}>
                  <Image source={require('../../../../assets/logo.png')} style={forms.authLogo} resizeMode="contain"/>
                </View>
                <Text style={forms.authTitle}>Welcome Back</Text>
                <Text style={forms.authSubtitle}>Sign in to continue planning</Text>
              </View>

              <View style={forms.authForm}>
                {/* Modular Inputs */}
                <AuthInput 
                    label="Email" 
                    value={email} 
                    onChangeText={setEmail} 
                    placeholder="Enter your email"
                    iconName="mail-outline"
                    keyboardType="email-address"
                />
                <AuthInput 
                    label="Password" 
                    value={password} 
                    onChangeText={setPassword} 
                    placeholder="Enter your password"
                    iconName="lock-closed-outline"
                    isPassword={true}
                />
                <TouchableOpacity style={forms.authForgotPassword}>
                  <Text style={forms.authForgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
                {error ? <Text style={forms.authErrorText}>{error}</Text> : null}
                <TouchableOpacity onPress={handleLogin} activeOpacity={0.8}>
                  <LinearGradient colors={['#1E3A8A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={forms.authButton}>
                    <Text style={forms.authButtonText}>Sign In</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <View style={forms.authDividerContainer}>
                  <View style={forms.authDivider} />
                  <Text style={forms.authDividerText}>Or continue with</Text>
                  <View style={forms.authDivider} />
                </View>
                {/* Modular Social Buttons */}
                <SocialLoginButtons onGoogleLogin={handleGoogleLogin} />
                <View style={forms.authFooter}>
                  <View style={forms.authLinkContainer}>
                    <Text style={forms.authLinkText}>Don't have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                      <Text style={forms.authLink}>Sign Up</Text>
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