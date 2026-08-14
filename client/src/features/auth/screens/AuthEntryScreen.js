import React from 'react';
import { TouchableOpacity } from 'react-native';
import AppText from '../../../components/AppText';
import { authStyles } from '../../../styles';
import AuthLayout from '../components/AuthLayout';
import BrandWordmark from '../components/BrandWordmark';

export default function AuthEntryScreen({ navigation }) {
  return (
    <AuthLayout testID="auth-entry-screen" keyboard={false}>
      <BrandWordmark />
      <AppText style={[authStyles.title, authStyles.centeredTitle]}>תכנון טיולים מתחיל כאן</AppText>
      <AppText style={[authStyles.subtitle, authStyles.centeredText]}>
        התחברו כדי לשמור יעדים, לבנות מסלולים ולקבל התאמה אישית.
      </AppText>
      <TouchableOpacity style={authStyles.primaryButton} onPress={() => navigation.navigate('Login')}>
        <AppText style={authStyles.primaryButtonText}>התחברות</AppText>
      </TouchableOpacity>
      <TouchableOpacity style={authStyles.secondaryButton} onPress={() => navigation.navigate('Register')}>
        <AppText style={authStyles.secondaryButtonText}>יצירת חשבון</AppText>
      </TouchableOpacity>
      <TouchableOpacity style={authStyles.textButton} onPress={() => navigation.navigate('Main')}>
        <AppText style={authStyles.textButtonText}>המשך גלישה כאורח</AppText>
      </TouchableOpacity>
    </AuthLayout>
  );
}
