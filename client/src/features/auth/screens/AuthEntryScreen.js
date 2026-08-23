import React, { useState } from 'react';
import { ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppText from '../../../components/AppText';
import { authStyles } from '../../../styles';
import BrandWordmark from '../components/BrandWordmark';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import WelcomeTravelArtwork from '../components/WelcomeTravelArtwork';
import { shouldEnableAccessibleAuthOverflow } from '../components/AuthFormLayout';
import {
  ensureAuthenticatedUserProfile,
  formatAuthError,
  isProviderCancellation,
  signInWithApple,
  signInWithGoogle,
} from '../../../services/AuthService';
import { openMainTab, resetToMain, resetToRootRoute } from '../../../navigation/authNavigation';
import { useAuth } from '../AuthContext';

export default function AuthEntryScreen({ navigation }) {
  const { runAuthTransition } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [error, setError] = useState('');
  const { fontScale = 1 } = useWindowDimensions();
  const accessibleOverflow = shouldEnableAccessibleAuthOverflow(fontScale);
  const loading = Boolean(loadingProvider);

  const handleSocialLogin = async (provider) => {
    setLoadingProvider(provider);
    setError('');
    try {
      await runAuthTransition(async () => {
        const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
        const bootstrap = await ensureAuthenticatedUserProfile(result.user, result.profile);
        if (bootstrap?.created) resetToRootRoute(navigation, 'CompleteAccount');
        else resetToMain(navigation);
      }, provider === 'apple' ? 'sign_in_apple' : 'sign_in_google');
    } catch (socialError) {
      if (!isProviderCancellation(socialError)) setError(formatAuthError(socialError));
    } finally {
      setLoadingProvider(null);
    }
  };

  const content = (
    <View style={authStyles.welcomeContent}>
      <View style={authStyles.welcomeHero}>
        <View style={authStyles.welcomeWordmarkCapsule}>
          <BrandWordmark welcome testID="welcome-brand-wordmark" />
        </View>
        <WelcomeTravelArtwork />
      </View>
      <View style={authStyles.welcomeSheet}>
        <AppText style={authStyles.welcomeTitle}>הטיול שלך מתחיל כאן</AppText>
        <AppText style={authStyles.welcomeSubtitle}>
          התחברו כדי לשמור יעדים, לבנות מסלולים ולקבל התאמה אישית.
        </AppText>
        <TouchableOpacity
          style={[authStyles.welcomePrimaryButton, loading && authStyles.primaryButtonDisabled]}
          onPress={() => navigation.navigate('Login')}
          disabled={loading}
          accessibilityRole="button"
          testID="auth-entry-login-button"
        >
          <AppText style={authStyles.primaryButtonText}>התחברות</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[authStyles.welcomeSecondaryButton, loading && authStyles.primaryButtonDisabled]}
          onPress={() => navigation.navigate('Register')}
          disabled={loading}
          accessibilityRole="button"
          testID="auth-entry-register-button"
        >
          <AppText style={authStyles.welcomeSecondaryButtonText}>יצירת חשבון</AppText>
        </TouchableOpacity>
        <View style={authStyles.welcomeErrorSlot} testID="auth-entry-error-slot">
          {error ? <AppText style={authStyles.welcomeError} testID="auth-entry-error">{error}</AppText> : null}
        </View>
        <SocialLoginButtons
          onGoogleLogin={() => handleSocialLogin('google')}
          onAppleLogin={() => handleSocialLogin('apple')}
          disabled={loading}
          loadingProvider={loadingProvider}
        />
        <TouchableOpacity
          style={authStyles.welcomeGuestButton}
          onPress={() => openMainTab(navigation, 'Home')}
          disabled={loading}
          accessibilityRole="button"
          testID="continue-as-guest"
        >
          <AppText style={authStyles.welcomeGuestText}>המשך גלישה כאורח</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={authStyles.welcomeSafe} edges={['top', 'right', 'bottom', 'left']} testID="auth-entry-screen">
      <LinearGradient colors={['#FFF0D2', '#F8F5EC', '#E6F2FA']} style={authStyles.welcomeGradient}>
        {accessibleOverflow ? (
          <ScrollView
            contentContainerStyle={authStyles.welcomeAccessibleContent}
            showsVerticalScrollIndicator={false}
            testID="auth-entry-accessible-scroll"
          >
            {content}
          </ScrollView>
        ) : content}
      </LinearGradient>
    </SafeAreaView>
  );
}
