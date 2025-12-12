import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../../config/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { forms } from '../../../styles';

const GOOGLE_LOGO = "https://cdn-icons-png.flaticon.com/512/300/300221.png";
const FACEBOOK_LOGO = "https://cdn-icons-png.flaticon.com/512/5968/5968764.png";
const APPLE_LOGO = "https://cdn-icons-png.flaticon.com/512/0/747.png";

/**
 * Screen for user registration.
 * Allows new users to sign up with email, password, and full name.
 *
 * @param {Object} navigation - Navigation object for screen transitions.
 */
export default function RegisterScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [securePassword, setSecurePassword] = useState(true);
  const [secureConfirmPassword, setSecureConfirmPassword] = useState(true);

  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setError('');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update the user profile with the full name
      if (userCredential.user) {
        await updateProfile(userCredential.user, {
          displayName: fullName
        });
      }

      console.log('Registered!');
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
              {/* Header */}
              <View style={forms.authHeader}>
                <View style={forms.authLogoContainer}>
                   <Image
                    source={require('../../../../assets/logo.png')}
                    style={forms.authLogo}
                    resizeMode="contain"
                  />
                </View>
                <Text style={forms.authTitle}>Create Account</Text>
                <Text style={forms.authSubtitle}>Start your travel journey</Text>
              </View>

              {/* Form */}
              <View style={forms.authForm}>
                {/* Full Name */}
                <View style={forms.authInputContainer}>
                  <Text style={forms.authInputLabel}>Full Name</Text>
                  <View style={forms.authInputWrapper}>
                    <Ionicons name="person-outline" size={20} color="#6B7280" style={forms.authInputIcon} />
                    <TextInput
                      style={forms.authInput}
                      placeholder="Enter your full name"
                      placeholderTextColor="#9CA3AF"
                      value={fullName}
                      onChangeText={setFullName}
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                {/* Email */}
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

                {/* Password */}
                <View style={forms.authInputContainer}>
                  <Text style={forms.authInputLabel}>Password</Text>
                  <View style={forms.authInputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={forms.authInputIcon} />
                    <TextInput
                      style={forms.authInput}
                      placeholder="Create a password"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={securePassword}
                    />
                    <TouchableOpacity onPress={() => setSecurePassword(!securePassword)} style={forms.authEyeIcon}>
                      <Ionicons name={securePassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm Password */}
                <View style={forms.authInputContainer}>
                  <Text style={forms.authInputLabel}>Confirm Password</Text>
                  <View style={forms.authInputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={forms.authInputIcon} />
                    <TextInput
                      style={forms.authInput}
                      placeholder="Confirm your password"
                      placeholderTextColor="#9CA3AF"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={secureConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setSecureConfirmPassword(!secureConfirmPassword)} style={forms.authEyeIcon}>
                       <Ionicons name={secureConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>

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
                  <LinearGradient
                    colors={['#1E3A8A', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={forms.authButton}
                  >
                    <Text style={forms.authButtonText}>Create Account</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Divider */}
                <View style={forms.authDividerContainer}>
                  <View style={forms.authDivider} />
                  <Text style={forms.authDividerText}>Or continue with</Text>
                  <View style={forms.authDivider} />
                </View>

                {/* Social Buttons */}
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

                {/* Footer / Login Link */}
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
