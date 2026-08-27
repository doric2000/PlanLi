import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RightDrawerNavigator from './RightDrawerNavigator';
import { useAuth } from '../features/auth/AuthContext';
import { AUTH_STATES } from '../constants/authPolicy';
import { colors, common } from '../styles';
import RegionSelectorScreen from '../features/region/screens/RegionSelectorScreen';
import { useOptionalRegionSelection } from '../features/region/context/RegionSelectionState';
import { isRegionDiscoveryEnabled } from '../features/region/regionDefinitions';

export default function PreferenceSetupGate({ navigation, route }) {
  const { status, loading, authFlowInProgress } = useAuth();
  const { selectedRegionId, loading: regionLoading } = useOptionalRegionSelection();
  const allowUnverified = route?.params?.allowUnverified === true;
  const allowIncomplete = route?.params?.allowIncomplete === true;

  useEffect(() => {
    if (loading || authFlowInProgress) return;
    if (allowIncomplete) return;
    if (status === AUTH_STATES.EMAIL_VERIFICATION_REQUIRED && !allowUnverified) {
      navigation.reset({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    } else if ([AUTH_STATES.ACCOUNT_SETUP_REQUIRED, AUTH_STATES.LEGAL_CONSENT_REQUIRED].includes(status)) {
      navigation.reset({ index: 0, routes: [{ name: 'CompleteAccount' }] });
    }
  }, [allowIncomplete, allowUnverified, authFlowInProgress, loading, navigation, status]);

  if (authFlowInProgress) return <RightDrawerNavigator />;

  if (loading || (!allowIncomplete && (
    status !== AUTH_STATES.READY
    && status !== AUTH_STATES.GUEST
    && status !== AUTH_STATES.PREFERENCES_REQUIRED
    && !(status === AUTH_STATES.EMAIL_VERIFICATION_REQUIRED && allowUnverified)
  ))) {
    return (
      <SafeAreaView style={common.container}>
        <View style={common.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isRegionDiscoveryEnabled() && (regionLoading || !selectedRegionId)) {
    if (regionLoading) {
      return <SafeAreaView style={common.container}><View style={common.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View></SafeAreaView>;
    }
    return <RegionSelectorScreen navigation={navigation} route={{ params: { required: true } }} />;
  }

  return <RightDrawerNavigator />;
}
