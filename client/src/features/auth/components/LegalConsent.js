import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { authStyles } from '../../../styles';

export default function LegalConsent({ accepted, onChange, navigation, disabled = false, compact = false }) {
  return (
    <View style={[authStyles.checkboxRow, compact && authStyles.compactCheckboxRow]}>
      <TouchableOpacity
        style={authStyles.checkbox}
        onPress={() => onChange(!accepted)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted, disabled }}
        accessibilityLabel="אישור תנאי השימוש ומדיניות הפרטיות"
        testID="legal-consent-checkbox"
      >
        <Ionicons
          name={accepted ? 'checkbox' : 'square-outline'}
          size={25}
          color={accepted ? '#F5961D' : '#7B8794'}
        />
      </TouchableOpacity>
      <AppText style={[authStyles.consentText, compact && authStyles.compactConsentText]}>
        אני מסכים/ה ל
        <AppText style={authStyles.inlineLink} onPress={() => navigation.navigate('Terms')}>תנאי השימוש</AppText>
        {' '}וקראתי את{' '}
        <AppText style={authStyles.inlineLink} onPress={() => navigation.navigate('Privacy')}>מדיניות הפרטיות</AppText>
      </AppText>
    </View>
  );
}
