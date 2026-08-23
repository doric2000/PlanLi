import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';

import { forms } from '../../../styles';

export const SocialLoginButtons = ({
  onGoogleLogin,
  onAppleLogin,
  disabled = false,
  loadingProvider = null,
}) => {
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((available) => active && setAppleAvailable(available))
        .catch(() => active && setAppleAvailable(false));
    }
    return () => { active = false; };
  }, []);

  if (Platform.OS === 'web') return null;

  return (
    <View style={forms.authSocialContainer} testID="auth-social-buttons">
      {Platform.OS === 'ios' && appleAvailable ? (
        <Pressable
          style={({ pressed }) => [forms.authProviderIconSlot, pressed && forms.authProviderIconPressed]}
          onPress={onAppleLogin}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="המשך עם Apple"
          testID="auth-apple-button"
        >
          <Image
            source={require('../../../../assets/apple-sign-in-logo.png')}
            style={forms.authAppleIcon}
            resizeMode="contain"
          />
          {loadingProvider === 'apple' ? (
            <View style={forms.authProviderLoadingOverlay} pointerEvents="none">
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
      ) : null}
      <View style={forms.authProviderIconSlot}>
        <GoogleSigninButton
          style={forms.authGoogleIconButton}
          size={GoogleSigninButton.Size.Icon}
          color={GoogleSigninButton.Color.Light}
          onPress={onGoogleLogin}
          disabled={disabled}
          accessibilityLabel="המשך עם Google"
          testID="auth-google-button"
        />
        {loadingProvider === 'google' ? (
          <View style={forms.authProviderLoadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#1E3A5F" />
          </View>
        ) : null}
      </View>
    </View>
  );
};
