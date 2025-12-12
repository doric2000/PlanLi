import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { forms } from '../../../styles';

const GOOGLE_LOGO = "https://cdn-icons-png.flaticon.com/512/300/300221.png";
const FACEBOOK_LOGO = "https://cdn-icons-png.flaticon.com/512/5968/5968764.png";
const APPLE_LOGO = "https://cdn-icons-png.flaticon.com/512/0/747.png";

/**
 * Screen for user login.
 * Allows users to sign in with email and password.
 *
 * @param {Object} navigation - Navigation object for screen transitions.
 */
export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      setError('');
      await signInWithEmailAndPassword(auth, email, password);
      // Navigate to Home
      navigation.replace('Main');
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
              <View style={forms.authHeader}>
                <View style={forms.authLogoContainer}>
                  <Image
                    source={require('../../../../assets/logo.png')}
                    style={forms.authLogo}
                    resizeMode="contain"
                  />
                </View>
                <Text style={forms.authTitle}>Welcome Back</Text>
                <Text style={forms.authSubtitle}>Sign in to continue planning</Text>
              </View>

              <View style={forms.authForm}>
                <View style={forms.authInputContainer}>
                  <Text style={forms.authInputLabel}>Email</Text>
                  <View style={forms.authInputWrapper}>
                    <Ionicons name="mail-outline" size={20} color="#6B7280" style={forms.authInputIcon} />
                    <TextInput
                      style={forms.authInput}
                      placeholder="Enter your email"
                      placeholderTextColor="#9CA3AF"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={forms.authInputContainer}>
                  <Text style={forms.authInputLabel}>Password</Text>
                  <View style={forms.authInputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={forms.authInputIcon} />
                    <TextInput
                      style={forms.authInput}
                      placeholder="Enter your password"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={secureTextEntry}
                    />
                    <TouchableOpacity onPress={() => setSecureTextEntry(!secureTextEntry)} style={forms.authEyeIcon}>
                      <Ionicons name={secureTextEntry ? "eye-off-outline" : "eye-outline"} size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={forms.authForgotPassword}>
                  <Text style={forms.authForgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>

                {error ? <Text style={forms.authErrorText}>{error}</Text> : null}

                <TouchableOpacity onPress={handleLogin} activeOpacity={0.8}>
                  <LinearGradient
                    colors={['#1E3A8A', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={forms.authButton}
                  >
                    <Text style={forms.authButtonText}>Sign In</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <View style={forms.authDividerContainer}>
                  <View style={forms.authDivider} />
                  <Text style={forms.authDividerText}>Or continue with</Text>
                  <View style={forms.authDivider} />
                </View>

                <View style={forms.authSocialContainer}>
                  <TouchableOpacity style={forms.authSocialButton}>
                    <Image 
                      source={{ uri: GOOGLE_LOGO }} 
                      style={forms.authSocialIcon} 
                    />
                  </TouchableOpacity>

                  <TouchableOpacity style={forms.authSocialButton}>
                    <Image 
                      source={{ uri: FACEBOOK_LOGO }} 
                      style={forms.authSocialIcon} 
                    />
                  </TouchableOpacity>

                  <TouchableOpacity style={forms.authSocialButton}>
                    <Image 
                      source={{ uri: APPLE_LOGO }} 
                      style={forms.authSocialIcon} 
                    />
                  </TouchableOpacity>
                </View>

                <View style={forms.authFooter}>
                  <View style={forms.authLinkContainer}>
                    <Text style={forms.authLinkText}>Don't have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                      <Text style={forms.authLink}>Sign Up</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={forms.authCardDecoration} pointerEvents="none">
                <Image
                  source={require('../../../../assets/logo.png')}
                  style={forms.authCardLogo}
                  resizeMode="contain"
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
