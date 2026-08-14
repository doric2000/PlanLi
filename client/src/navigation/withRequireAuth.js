import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../features/auth/AuthContext';
import { AUTH_STATES, CAPABILITIES } from '../constants/authPolicy';
import { colors, common } from '../styles';

function RequireAuthWrapper(ScreenComponent, capability = CAPABILITIES.SIGNED_IN) {
  return function RequireAuthScreen(props) {
    const { isGuest, isActive, loading, requireCapability, status } = useAuth();
    const preferencesAllowed = [AUTH_STATES.PREFERENCES_REQUIRED, AUTH_STATES.READY].includes(status);
    const blocked = capability === CAPABILITIES.ACTIVE
      ? !isActive
      : capability === CAPABILITIES.PREFERENCES_SETUP
        ? !preferencesAllowed
        : isGuest;

    useEffect(() => {
      if (loading) return;
      if (!blocked) return;

      requireCapability(capability, {
        name: props.route?.name || 'Main',
        params: props.route?.params,
      });
    }, [blocked, capability, loading, props.route?.name, props.route?.params, requireCapability]);

    if (loading) {
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
