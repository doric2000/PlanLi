import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import AuthEntryScreen from '../features/auth/screens/AuthEntryScreen';
import LoginScreen from '../features/auth/screens/LoginScreen';
import RegisterScreen from '../features/auth/screens/RegisterScreen';
import ForgotPasswordScreen from '../features/auth/screens/ForgotPasswordScreen';
import ResetEmailSentScreen from '../features/auth/screens/ResetEmailSentScreen';
import LegalDocumentScreen from '../features/legal/screens/LegalDocumentScreen';
import { rtlStackScreenOptions } from './rtlStackOptions';

const Stack = createStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator initialRouteName="AuthEntry" screenOptions={rtlStackScreenOptions}>
      <Stack.Screen name="AuthEntry" component={AuthEntryScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetEmailSent" component={ResetEmailSentScreen} />
      <Stack.Screen name="Terms" component={LegalDocumentScreen} />
      <Stack.Screen name="Privacy" component={LegalDocumentScreen} />
    </Stack.Navigator>
  );
}
