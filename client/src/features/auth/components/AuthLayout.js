import BackButton from '../../../components/BackButton';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authStyles } from '../../../styles';

export default function AuthLayout({
  children,
  testID,
  keyboard = true,
  showBack = false,
  onBack,
}) {
  const content = (
    <ScrollView
      contentContainerStyle={authStyles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={authStyles.shell} testID={testID}>
        <View style={authStyles.card}>
          {showBack ? (
            <View style={authStyles.backRow}>
              <BackButton color="dark" variant="solid" style={authStyles.backButton}
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="חזרה"
                testID="auth-back-button"
              />
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </ScrollView>
  );
  return (
    <SafeAreaView style={authStyles.safe} edges={['top', 'right', 'bottom', 'left']}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={authStyles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : content}
    </SafeAreaView>
  );
}
