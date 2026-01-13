import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../../../config/firebase';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useRegisterOrUpdateUser } from '../../../hooks/useRegisterOrUpdateUser';
import { forms } from '../../../styles';

// --- Import the new Modular Components ---
import { AuthInput } from '../../../components/AuthInput';
import { SocialLoginButtons } from '../components/SocialLoginButtons';

export default function RegisterScreen({ navigation }) {
  const registerOrUpdateUser = useRegisterOrUpdateUser();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

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
                <Text style={forms.authTitle}>Create Account</Text>
                <Text style={forms.authSubtitle}>Start your travel journey</Text>
              </View>

              <View style={forms.authForm}>
                
                {/* --- Reusable Inputs --- */}
                <AuthInput
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  iconName="person-outline"
                  autoCapitalize="words"
                />

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
                  placeholder="Create a password"
                  iconName="lock-closed-outline"
                  isPassword={true}
                />

                <AuthInput
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  iconName="lock-closed-outline"
                  isPassword={true}
                />

                {/* Terms Text */}
                <View style={forms.authTermsContainer}>
                  <Text style={forms.authTermsText}>
                    By signing up, you agree to our{' '}
                    <Text style={forms.authTermsLink}>Terms of Service</Text> and{' '}
                    <Text style={forms.authTermsLink}>Privacy Policy</Text>
                  </Text>
                </View>

                {error ? <Text style={forms.authErrorText}>{error}</Text> : null}

                {/* Register Button */}
                <TouchableOpacity onPress={handleRegister} activeOpacity={0.8}>
                  <LinearGradient colors={['#1E3A8A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={forms.authButton}>
                    <Text style={forms.authButtonText}>Create Account</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Divider */}
                <View style={forms.authDividerContainer}>
                  <View style={forms.authDivider} />
                  <Text style={forms.authDividerText}>Or continue with</Text>
                  <View style={forms.authDivider} />
                </View>

                {/* --- Reusable Social Buttons --- */}
                <SocialLoginButtons />

                {/* Footer */}
                <View style={forms.authFooter}>
                  <Text style={forms.authFooterText}>Join thousands of travelers</Text>
                  <Text style={forms.authFooterText}>exploring the world together</Text>

                  <View style={forms.authLinkContainer}>
                    <Text style={forms.authLinkText}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                      <Text style={forms.authLink}>Sign in</Text>
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