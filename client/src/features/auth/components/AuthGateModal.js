import React from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { AUTH_STATES } from '../../../constants/authPolicy';
import { useAuth } from '../AuthContext';
import { authStyles } from '../../../styles';

const COPY = {
  [AUTH_STATES.GUEST]: {
    title: 'נדרשת התחברות',
    body: 'כדי לבצע את הפעולה צריך להתחבר או ליצור חשבון.',
    action: 'התחברות',
  },
  [AUTH_STATES.EMAIL_VERIFICATION_REQUIRED]: {
    title: 'נדרש אימות אימייל',
    body: 'אמתו את כתובת האימייל כדי לבצע פעולות שמעדכנות את החשבון או התוכן.',
    action: 'לאימות האימייל',
  },
  [AUTH_STATES.ACCOUNT_SETUP_REQUIRED]: {
    title: 'צריך להשלים את החשבון',
    body: 'נשארו פרטי פרופיל והסכמה לתנאים לפני שאפשר לבצע את הפעולה.',
    action: 'השלמת החשבון',
  },
  [AUTH_STATES.PREFERENCES_REQUIRED]: {
    title: 'נשארו העדפות נסיעה',
    body: 'השלימו את ההעדפות הראשוניות כדי לפתוח את כל פעולות PlanLi.',
    action: 'להשלמת ההעדפות',
  },
};

export default function AuthGateModal() {
  const { gate, dismissGate, openRegistration, openRequiredStep } = useAuth();
  const copy = COPY[gate?.status] || COPY[AUTH_STATES.GUEST];
  return (
    <Modal
      visible={Boolean(gate)}
      transparent
      animationType="fade"
      onRequestClose={dismissGate}
      testID="auth-gate-modal"
    >
      <View style={authStyles.modalOverlay}>
        <View style={authStyles.modalCard}>
          <View style={authStyles.modalIcon}>
            <Ionicons name="lock-closed" size={25} color="#F5961D" />
          </View>
          <AppText style={authStyles.modalTitle}>{copy.title}</AppText>
          <AppText style={authStyles.modalBody}>{copy.body}</AppText>
          <TouchableOpacity style={authStyles.primaryButton} onPress={openRequiredStep} testID="auth-gate-primary">
            <AppText style={authStyles.primaryButtonText}>{copy.action}</AppText>
          </TouchableOpacity>
          {gate?.status === AUTH_STATES.GUEST ? (
            <TouchableOpacity style={authStyles.secondaryButton} onPress={openRegistration} testID="auth-gate-register">
              <AppText style={authStyles.secondaryButtonText}>יצירת חשבון</AppText>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={authStyles.textButton} onPress={dismissGate} testID="auth-gate-dismiss">
            <AppText style={authStyles.textButtonText}>לא עכשיו</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
