import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RightDrawerNavigator from './RightDrawerNavigator';
import { useSmartProfile } from '../hooks/useSmartProfile';
import { colors, common } from '../styles';

export default function PreferenceSetupGate({ navigation }) {
  const { loading, setupRequired } = useSmartProfile();

  useEffect(() => {
    if (!loading && setupRequired) {
      navigation.reset({ index: 0, routes: [{ name: 'PreferenceSetup' }] });
    }
  }, [loading, navigation, setupRequired]);

  if (loading || setupRequired) {
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
