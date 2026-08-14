import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RightDrawerNavigator from './RightDrawerNavigator';
import { useAuth } from '../features/auth/AuthContext';
import { AUTH_STATES } from '../constants/authPolicy';
import { colors, common } from '../styles';

export default function PreferenceSetupGate({ navigation, route }) {
  const { status, loading } = useAuth();
  const allowUnverified = route?.params?.allowUnverified === true;

  useEffect(() => {
    if (loading) return;
    if (status === AUTH_STATES.EMAIL_VERIFICATION_REQUIRED && !allowUnverified) {
      navigation.reset({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    } else if (status === AUTH_STATES.ACCOUNT_SETUP_REQUIRED) {
      navigation.reset({ index: 0, routes: [{ name: 'CompleteAccount' }] });
    } else if (status === AUTH_STATES.PREFERENCES_REQUIRED) {
      navigation.reset({ index: 0, routes: [{ name: 'PreferenceSetup' }] });
    }
  }, [allowUnverified, loading, navigation, status]);

  if (loading || (
    status !== AUTH_STATES.READY
    && status !== AUTH_STATES.GUEST
    && !(status === AUTH_STATES.EMAIL_VERIFICATION_REQUIRED && allowUnverified)
  )) {
    return (
      <SafeAreaView style={common.container}>
        <View style={common.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return <RightDrawerNavigator />;
}
