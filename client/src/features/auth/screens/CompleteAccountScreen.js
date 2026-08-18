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
import { AUTH_STATES, PROFILE_DETAILS_VERSION } from '../../../constants/authPolicy';
import {
  normalizeDisplayName,
  sanitizeDisplayNameInput,
  validateDisplayName,
} from '../utils/displayName';

export default function CompleteAccountScreen({ navigation }) {
  const { user, userDocument, synchronizeUserDocument } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isLegalRenewal = Boolean(
    userDocument?.displayName
    && userDocument?.onboarding?.profileDetailsVersion === PROFILE_DETAILS_VERSION
    && userDocument?.onboarding?.profileDetailsCompletedAt
  );
  useEffect(() => {
    setDisplayName(userDocument?.displayName || user?.displayName || '');
  }, [user?.displayName, userDocument?.displayName]);
  const submit = async () => {
    const name = normalizeDisplayName(displayName);
    const displayNameError = validateDisplayName(name);
    if (displayNameError) return setError(displayNameError);
    if (!acceptedLegal) return setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות.');
    setLoading(true); setError('');
    try {
      const result = await completeAccountSetup({ displayName: name, acceptedLegal });
      const nextStatus = synchronizeUserDocument(result.userDocument);
      if (nextStatus === AUTH_STATES.PREFERENCES_REQUIRED) {
        navigation.reset({ index: 0, routes: [{ name: 'PreferenceSetup' }] });
      } else if (nextStatus === AUTH_STATES.READY) {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        throw new Error('מצב החשבון לא התעדכן. נסו להתנתק ולהתחבר מחדש.');
      }
    } catch (submitError) {
      setError(formatAuthError(submitError));
    } finally { setLoading(false); }
  };
  return (
    <AuthLayout testID="complete-account-screen">
      <BrandWordmark compact />
      <AppText style={authStyles.title}>כמעט סיימנו</AppText>
      <AppText style={authStyles.subtitle}>{isLegalRenewal
        ? 'מדיניות הפרטיות עודכנה. כדי להמשיך, יש לעיין בגרסה החדשה ולאשר אותה פעם אחת.'
        : 'בכניסה הראשונה עם Google או Apple משלימים שם ומאשרים את תנאי השימוש ומדיניות הפרטיות.'}</AppText>
      <AuthInput
        label="שם מלא"
        value={displayName}
        onChangeText={(value) => setDisplayName(sanitizeDisplayNameInput(value))}
        placeholder="הזינו את שמכם המלא"
        iconName="person-outline"
        autoCapitalize="words"
        editable={!isLegalRenewal}
      />
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
