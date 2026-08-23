import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authStyles } from '../../../styles';

const COMPACT_VIEWPORT_HEIGHT = 700;
const ACCESSIBLE_FONT_SCALE = 1.2;

export function shouldEnableAccessibleAuthOverflow(fontScale = 1) {
  return fontScale > ACCESSIBLE_FONT_SCALE;
}

export default function AuthFormLayout({ children, testID, onBack }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { height, fontScale = 1 } = useWindowDimensions();

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const compact = keyboardVisible || height <= COMPACT_VIEWPORT_HEIGHT;
  const accessibleOverflow = shouldEnableAccessibleAuthOverflow(fontScale);

  const formContent = (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View
        style={[
          authStyles.formShell,
          accessibleOverflow ? authStyles.formShellAccessible : authStyles.formShellStatic,
          compact && authStyles.formShellCompact,
          keyboardVisible && authStyles.formShellEditing,
        ]}
      >
        <View
          style={[
            authStyles.formCard,
            compact && authStyles.formCardCompact,
            keyboardVisible && authStyles.formCardEditing,
          ]}
          testID={testID}
        >
          {!keyboardVisible ? (
            <TouchableOpacity
              style={authStyles.formBackButton}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
              testID="auth-back-button"
            >
              <Ionicons name="chevron-forward" size={24} color="#1E3A5F" />
            </TouchableOpacity>
          ) : null}
          {typeof children === 'function'
            ? children({ compact, keyboardVisible })
            : children}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );

  return (
    <SafeAreaView style={authStyles.formSafe} edges={['top', 'right', 'bottom', 'left']}>
      <LinearGradient colors={['#FFFFFF', '#FBFCFE', '#FFF8ED']} style={authStyles.formGradient}>
        {!keyboardVisible ? (
          <View pointerEvents="none" style={authStyles.formDecoration} testID="auth-form-decoration">
            <View style={authStyles.formDecorationNavy} />
            <View style={authStyles.formDecorationOrange} />
            <View style={authStyles.formRouteLine} />
          </View>
        ) : null}
        <KeyboardAvoidingView
          style={authStyles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {accessibleOverflow ? (
            <ScrollView
              style={authStyles.formAccessibleScroll}
              contentContainerStyle={authStyles.formAccessibleScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              testID="auth-accessible-scroll"
            >
              {formContent}
            </ScrollView>
          ) : formContent}
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}
