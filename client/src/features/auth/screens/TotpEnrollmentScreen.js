import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { formatAuthError, signOutCentral } from '../../../services/AuthService';
import {
  beginTotpEnrollment,
  cancelTotpEnrollment,
  finishTotpEnrollment,
} from '../../../services/MfaService';
import { openAuthFlow } from '../../../navigation/authNavigation';
import { authStyles } from '../../../styles';
import AuthLayout from '../components/AuthLayout';

export default function TotpEnrollmentScreen({ navigation }) {
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    beginTotpEnrollment()
      .then((value) => active && setEnrollment(value))
      .catch((enrollmentError) => active && setError(formatAuthError(enrollmentError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      cancelTotpEnrollment();
    };
  }, []);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await finishTotpEnrollment(code);
      Alert.alert(
        'האימות הופעל',
        'מטעמי אבטחה יש להתחבר מחדש. מעכשיו פעולות ניהול יחייבו קוד מאפליקציית האימות.'
      );
      await signOutCentral();
      openAuthFlow(navigation, 'Login');
    } catch (enrollmentError) {
      setError(formatAuthError(enrollmentError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      testID="totp-enrollment-screen"
      showBack
      onBack={() => {
        cancelTotpEnrollment();
        navigation.goBack();
      }}
    >
      <AppText style={authStyles.title}>הפעלת אימות דו־שלבי</AppText>
      <AppText style={authStyles.subtitle}>
        סרקו את הקוד באפליקציית Authenticator. אל תשמרו צילום מסך ואל תשתפו את המפתח.
      </AppText>
      {loading && !enrollment ? <ActivityIndicator color="#1E3A5F" /> : null}
      {enrollment ? (
        <>
          <View style={authStyles.totpQrCard} testID="totp-enrollment-qr">
            <QRCode value={enrollment.qrCodeUrl} size={190} />
          </View>
          <AppText style={authStyles.totpManualLabel}>אפשר גם להקליד ידנית:</AppText>
          <AppText selectable style={authStyles.totpSecret} testID="totp-enrollment-secret">
            {enrollment.secretKey}
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
            testID="totp-enrollment-code"
          />
        </>
      ) : null}
      {error ? <AppText style={authStyles.error} testID="totp-enrollment-error">{error}</AppText> : null}
      <TouchableOpacity
        disabled={loading || !enrollment || code.length !== 6}
        onPress={submit}
        style={[authStyles.primaryButton, (loading || !enrollment || code.length !== 6) && authStyles.primaryButtonDisabled]}
        testID="totp-enrollment-submit"
      >
        {loading && enrollment ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>הפעלת אימות</AppText>}
      </TouchableOpacity>
    </AuthLayout>
  );
}
