import React, { useState } from 'react';
import { ActivityIndicator, TouchableOpacity } from 'react-native';

import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { formatAuthError, ensureAuthenticatedUserProfile } from '../../../services/AuthService';
import {
  clearPendingTotpSignIn,
  completeTotpSignIn,
  hasPendingTotpSignIn,
} from '../../../services/MfaService';
import { authStyles } from '../../../styles';
import { resetToMain, resetToRootRoute } from '../../../navigation/authNavigation';
import { useAuth } from '../AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function TotpChallengeScreen({ navigation }) {
  const { runAuthTransition } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cancel = () => {
    clearPendingTotpSignIn();
    navigation.goBack();
  };

  const submit = async () => {
    if (!hasPendingTotpSignIn()) {
      setError(formatAuthError({ code: 'auth/missing-multi-factor-session' }));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await runAuthTransition(async () => {
        const result = await completeTotpSignIn(code);
        const bootstrap = await ensureAuthenticatedUserProfile(result.user, result.profile || {});
        if (bootstrap?.created) resetToRootRoute(navigation, 'CompleteAccount');
        else resetToMain(navigation);
      }, 'sign_in_totp');
    } catch (challengeError) {
      setError(formatAuthError(challengeError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout testID="totp-challenge-screen" showBack onBack={cancel}>
      <AppText style={authStyles.title}>אימות דו־שלבי</AppText>
      <AppText style={authStyles.subtitle}>
        הזינו את הקוד בן שש הספרות שמופיע באפליקציית האימות שלכם.
      </AppText>
      <AuthInput
        label="קוד אימות"
        value={code}
        onChangeText={(value) => setCode(String(value || '').replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        keyboardType="number-pad"
        contentDirection="ltr"
        returnKeyType="done"
        onSubmitEditing={submit}
        testID="totp-challenge-code"
      />
      {error ? <AppText style={authStyles.error} testID="totp-challenge-error">{error}</AppText> : null}
      <TouchableOpacity
        disabled={loading || code.length !== 6}
        onPress={submit}
        style={[authStyles.primaryButton, (loading || code.length !== 6) && authStyles.primaryButtonDisabled]}
        testID="totp-challenge-submit"
      >
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>אישור והתחברות</AppText>}
      </TouchableOpacity>
    </AuthLayout>
  );
}
