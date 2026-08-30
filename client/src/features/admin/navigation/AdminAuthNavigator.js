import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import ForgotPasswordScreen from '../../auth/screens/ForgotPasswordScreen';
import LoginScreen from '../../auth/screens/LoginScreen';
import ResetEmailSentScreen from '../../auth/screens/ResetEmailSentScreen';
import TotpChallengeScreen from '../../auth/screens/TotpChallengeScreen';
import { rtlStackScreenOptions } from '../../../navigation/rtlStackOptions';

const Stack = createStackNavigator();

export default function AdminAuthNavigator() {
  return (
    <Stack.Navigator initialRouteName="Login" screenOptions={rtlStackScreenOptions}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetEmailSent" component={ResetEmailSentScreen} />
      <Stack.Screen name="TotpChallenge" component={TotpChallengeScreen} />
    </Stack.Navigator>
  );
}
