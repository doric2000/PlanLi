import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthUser } from '../hooks/useAuthUser';
import { colors, common } from '../styles';

function RequireAuthWrapper(ScreenComponent) {
  return function RequireAuthScreen(props) {
    const { isGuest, loading } = useAuthUser();

    useEffect(() => {
      if (loading) return;
      if (!isGuest) return;

      props.navigation?.reset?.({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    }, [isGuest, loading, props.navigation]);

    if (loading) {
      return (
        <SafeAreaView style={common.container}>
          <View style={common.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        </SafeAreaView>
      );
    }

    if (isGuest) return null;

    return <ScreenComponent {...props} />;
  };
}

export default RequireAuthWrapper;
