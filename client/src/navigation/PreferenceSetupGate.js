import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../components/AppText';
import RightDrawerNavigator from './RightDrawerNavigator';
import { useSmartProfile } from '../hooks/useSmartProfile';
import { useAuthUser } from '../hooks/useAuthUser';
import { ensureAuthenticatedUserProfile, formatAuthError } from '../services/AuthService';
import { getUserTier } from '../utils/userTier';
import { colors, common, preferenceSetupStyles as styles } from '../styles';

export default function PreferenceSetupGate({ navigation }) {
  const { user, loading: authLoading } = useAuthUser();
  const [bootstrapState, setBootstrapState] = useState('loading');
  const [bootstrapError, setBootstrapError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const { loading, setupRequired, error: profileError } = useSmartProfile(retryKey);

  useEffect(() => {
    let active = true;
    if (authLoading) return () => { active = false; };
    if (!user?.uid) {
      setBootstrapState('ready');
      setBootstrapError('');
      return () => { active = false; };
    }
    setBootstrapState('loading');
    setBootstrapError('');
    ensureAuthenticatedUserProfile(user)
      .then(() => {
        if (active) setBootstrapState('ready');
      })
      .catch((error) => {
        if (!active) return;
        setBootstrapError(formatAuthError(error));
        setBootstrapState('error');
      });
    return () => { active = false; };
  }, [authLoading, retryKey, user?.uid]);

  useEffect(() => {
    if (bootstrapState !== 'ready' || !profileError) return;
    setBootstrapError('לא הצלחנו לטעון את הפרופיל מהשרת. בדקו את החיבור ונסו שוב.');
    setBootstrapState('error');
  }, [bootstrapState, profileError]);

  useEffect(() => {
    if (bootstrapState !== 'ready' || !user) return;
    if (getUserTier(user) === 'unverified') {
      navigation.reset({ index: 0, routes: [{ name: 'VerifyEmail' }] });
    } else if (!loading && setupRequired) {
      navigation.reset({ index: 0, routes: [{ name: 'PreferenceSetup' }] });
    }
  }, [bootstrapState, loading, navigation, setupRequired, user]);

  if (bootstrapState === 'error') {
    return (
      <SafeAreaView style={common.containerCentered} testID="profile-bootstrap-error">
        <View style={styles.promptCard}>
          <AppText style={styles.promptTitle}>לא הצלחנו להכין את הפרופיל</AppText>
          <AppText style={styles.promptText}>{bootstrapError}</AppText>
          <TouchableOpacity
            style={styles.promptButton}
            onPress={() => setRetryKey((value) => value + 1)}
            testID="profile-bootstrap-retry"
          >
            <AppText style={styles.promptButtonText}>נסו שוב</AppText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (authLoading || bootstrapState !== 'ready' || loading || setupRequired) {
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
