import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../features/auth/AuthContext';
import { AUTH_STATES, CAPABILITIES } from '../constants/authPolicy';
import { colors, common } from '../styles';

function RequireAuthWrapper(ScreenComponent, capability = CAPABILITIES.SIGNED_IN) {
  return function RequireAuthScreen(props) {
    const { isGuest, isActive, loading, ensureCapability, status } = useAuth();
    const [checkingCapability, setCheckingCapability] = useState(false);
    const preferencesAllowed = [AUTH_STATES.PREFERENCES_REQUIRED, AUTH_STATES.READY].includes(status);
    const blocked = capability === CAPABILITIES.ACTIVE
      ? !isActive
      : capability === CAPABILITIES.PREFERENCES_SETUP
        ? !preferencesAllowed
        : isGuest;

    useEffect(() => {
      if (loading) return;
      if (!blocked) return;

      let active = true;
      setCheckingCapability(true);
      ensureCapability(capability, {
        name: props.route?.name || 'Main',
        params: props.route?.params,
      }, { blockedRoute: true }).finally(() => {
        if (active) setCheckingCapability(false);
      });
      return () => { active = false; };
    }, [blocked, capability, ensureCapability, loading, props.route?.name, props.route?.params]);

    if (loading || checkingCapability) {
      return (
        <SafeAreaView style={common.container}>
          <View style={common.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        </SafeAreaView>
      );
    }

    if (blocked) return null;

    return <ScreenComponent {...props} />;
  };
}

export default RequireAuthWrapper;
