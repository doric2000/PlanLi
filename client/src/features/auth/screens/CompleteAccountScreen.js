import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import { AuthInput } from '../../../components/AuthInput';
import { authStyles } from '../../../styles';
import { useAuth } from '../AuthContext';
import { completeAccountSetup } from '../../../services/ProfileService';
import { formatAuthError, signOutCentral } from '../../../services/AuthService';
import AuthLayout from '../components/AuthLayout';
import BrandWordmark from '../components/BrandWordmark';
import LegalConsent from '../components/LegalConsent';

export default function CompleteAccountScreen({ navigation }) {
  const { user, userDocument } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setDisplayName(userDocument?.displayName || user?.displayName || '');
  }, [user?.displayName, userDocument?.displayName]);
  const submit = async () => {
    const name = displayName.trim();
    if (name.length < 2) return setError('יש להזין שם מלא באורך של לפחות שני תווים.');
    if (!acceptedLegal) return setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות.');
    setLoading(true); setError('');
    try {
      await completeAccountSetup({ displayName: name, acceptedLegal });
      navigation.reset({ index: 0, routes: [{ name: 'PreferenceSetup' }] });
    } catch (submitError) {
      setError(formatAuthError(submitError));
    } finally { setLoading(false); }
  };
  return (
    <AuthLayout testID="complete-account-screen">
      <BrandWordmark compact />
      <AppText style={authStyles.title}>כמעט סיימנו</AppText>
      <AppText style={authStyles.subtitle}>הפרטים האלה נדרשים מכל משתמש, גם בהתחברות עם Google או Apple.</AppText>
      <AuthInput label="שם מלא" value={displayName} onChangeText={setDisplayName} placeholder="הזינו את שמכם המלא" iconName="person-outline" autoCapitalize="words" />
      <AppText style={authStyles.email}>{user?.email || 'כתובת פרטית של Apple'}</AppText>
      <LegalConsent accepted={acceptedLegal} onChange={setAcceptedLegal} navigation={navigation} disabled={loading} />
      {error ? <AppText style={authStyles.error}>{error}</AppText> : null}
      <TouchableOpacity style={authStyles.primaryButton} onPress={submit} disabled={loading} testID="complete-account-submit">
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppText style={authStyles.primaryButtonText}>המשך להתאמה אישית</AppText>}
      </TouchableOpacity>
      <View style={authStyles.utilityRow}>
        <TouchableOpacity style={authStyles.utilityLink} onPress={async () => { await signOutCentral(); navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); }}><AppText style={authStyles.utilityText}>התנתקות</AppText></TouchableOpacity>
        <TouchableOpacity style={authStyles.utilityLink} onPress={() => navigation.navigate('Settings')}><AppText style={authStyles.utilityText}>מחיקת חשבון</AppText></TouchableOpacity>
      </View>
    </AuthLayout>
  );
}
