import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../features/auth/AuthContext';
import { CAPABILITIES } from '../constants/authPolicy';
import { colors, common } from '../styles';

function RequireAuthWrapper(ScreenComponent, capability = CAPABILITIES.SIGNED_IN) {
  return function RequireAuthScreen(props) {
    const { isGuest, isActive, loading, requireCapability } = useAuth();
    const blocked = capability === CAPABILITIES.ACTIVE ? !isActive : isGuest;

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
