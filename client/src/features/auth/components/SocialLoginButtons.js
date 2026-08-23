import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';

import { forms } from '../../../styles';

export const SocialLoginButtons = ({
  mode = 'login',
  onGoogleLogin,
  onAppleLogin,
  disabled = false,
  compact = false,
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
    <View style={[forms.authSocialContainer, compact && forms.authSocialContainerCompact]} testID="auth-social-buttons">
      <GoogleSigninButton
        style={forms.authGoogleButton}
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Light}
        onPress={onGoogleLogin}
        disabled={disabled}
        testID="auth-google-button"
      />
      {Platform.OS === 'ios' && appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={mode === 'register'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={forms.authAppleButton}
          onPress={disabled ? () => {} : onAppleLogin}
          testID="auth-apple-button"
        />
      ) : null}
    </View>
  );
};
