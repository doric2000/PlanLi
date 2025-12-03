import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../config/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const GOOGLE_LOGO = "https://cdn-icons-png.flaticon.com/512/300/300221.png";
const FACEBOOK_LOGO = "https://cdn-icons-png.flaticon.com/512/5968/5968764.png";
const APPLE_LOGO = "https://cdn-icons-png.flaticon.com/512/0/747.png";

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
    <View style={styles.container}>
      {/* Background Logo Decoration */}
      <View style={styles.backgroundDecoration}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.backgroundLogo}
          resizeMode="contain"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.9)', '#FFFFFF']}
          style={styles.gradientOverlay}
        />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                 <Image
                  source={require('../../assets/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Start your travel journey</Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* Full Name */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  placeholderTextColor="#9CA3AF"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>

              {/* Email */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Password */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Create a password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={securePassword}
                  />
                  <TouchableOpacity onPress={() => setSecurePassword(!securePassword)} style={styles.eyeIcon}>
                    <Ionicons name={securePassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm your password"
                    placeholderTextColor="#9CA3AF"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={secureConfirmPassword}
                  />
                  <TouchableOpacity onPress={() => setSecureConfirmPassword(!secureConfirmPassword)} style={styles.eyeIcon}>
                     <Ionicons name={secureConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Terms Text */}
              <View style={styles.termsContainer}>
                <Text style={styles.termsText}>
                  By signing up, you agree to our{' '}
                  <Text style={styles.link}>Terms of Service</Text> and{' '}
                  <Text style={styles.link}>Privacy Policy</Text>
                </Text>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Register Button */}
              <TouchableOpacity onPress={handleRegister} activeOpacity={0.8}>
                <LinearGradient
                  colors={['#1E3A8A', '#2563EB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>Create Account</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>Or continue with</Text>
                <View style={styles.divider} />
              </View>

              {/* Social Buttons */}
              <View style={styles.socialContainer}>
                <TouchableOpacity style={styles.socialButton}>
                  <Image
                    source={{ uri: GOOGLE_LOGO }}
                    style={styles.socialIcon}
                  />
                </TouchableOpacity>

                <TouchableOpacity style={styles.socialButton}>
                  <Image
                    source={{ uri: FACEBOOK_LOGO }}
                    style={styles.socialIcon}
                  />
                </TouchableOpacity>

                <TouchableOpacity style={styles.socialButton}>
                  <Image
                    source={{ uri: APPLE_LOGO }}
                    style={styles.socialIcon}
                  />
                </TouchableOpacity>
              </View>

              {/* Footer / Login Link */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Join thousands of travelers</Text>
                <Text style={styles.footerText}>exploring the world together</Text>

                <View style={styles.signinContainer}>
                  <Text style={styles.existingAccountText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                    <Text style={styles.signInLink}>Sign in</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backgroundDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.45,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  backgroundLogo: {
    width: width * 1.2,
    height: width * 1.2,
    opacity: 0.08,
    transform: [{ translateY: -width * 0.4 }],
    tintColor: '#1E3A8A',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  logoContainer: {
    marginBottom: 16,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 4,
  },
  logo: {
    width: 90,
    height: 90,
    borderRadius: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    letterSpacing: 0.2,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1F2937',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1F2937',
  },
  eyeIcon: {
    marginLeft: 8,
  },
  termsContainer: {
    marginVertical: 16,
    alignItems: 'center',
  },
  termsText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  link: {
    color: '#2563EB',
    fontWeight: '600',
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 13,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#9CA3AF',
    fontSize: 13,
  },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 32,
  },
  socialButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  socialIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  signinContainer: {
    flexDirection: 'row',
    marginTop: 8,
    alignItems: 'center',
  },
  existingAccountText: {
    fontSize: 14,
    color: '#6B7280',
  },
  signInLink: {
    fontSize: 14,
    color: '#1E3A8A',
    fontWeight: '700',
  },
});
