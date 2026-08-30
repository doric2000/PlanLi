import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import AppFontProvider from './src/components/AppFontProvider';
import { AuthProvider, useAuth } from './src/features/auth/AuthContext';
import TotpEnrollmentScreen from './src/features/auth/screens/TotpEnrollmentScreen';
import AdminAuthNavigator from './src/features/admin/navigation/AdminAuthNavigator';
import AdminPanelScreen from './src/features/admin/screens/AdminPanelScreen';
import { rtlStackScreenOptions } from './src/navigation/rtlStackOptions';
import { colors, common } from './src/styles';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

function AdminEntryScreen(props) {
  const { user, loading } = useAuth();
  const { navigation } = props;

  useEffect(() => {
    if (!loading && !user) navigation.replace('AdminAuth', { screen: 'Login' });
  }, [loading, navigation, user]);

  if (loading || !user) {
    return (
      <View style={common.loadingContainer} testID="planli-admin-web-root">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return <AdminPanelScreen {...props} />;
}

export default function AdminWebApp() {
  return (
    <AppFontProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AuthProvider navigationRef={navigationRef}>
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator initialRouteName="AdminPanel" screenOptions={rtlStackScreenOptions}>
              <Stack.Screen name="AdminPanel" component={AdminEntryScreen} />
              <Stack.Screen
                name="AdminAuth"
                component={AdminAuthNavigator}
                options={{ headerShown: false }}
              />
              <Stack.Screen name="TotpEnrollment" component={TotpEnrollmentScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </AppFontProvider>
  );
}
