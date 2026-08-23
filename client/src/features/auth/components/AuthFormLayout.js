import React, { useEffect, useState } from 'react';
import {
  Keyboard,
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
import Svg, { Circle, Path } from 'react-native-svg';

import { authStyles } from '../../../styles';

const COMPACT_VIEWPORT_HEIGHT = 700;
const ACCESSIBLE_FONT_SCALE = 1.2;

export function shouldEnableAccessibleAuthOverflow(fontScale = 1) {
  return fontScale > ACCESSIBLE_FONT_SCALE;
}

export default function AuthFormLayout({ children, header, testID, onBack }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = React.useRef(null);
  const { height, fontScale = 1 } = useWindowDimensions();

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const compact = height <= COMPACT_VIEWPORT_HEIGHT;
  const accessibleOverflow = shouldEnableAccessibleAuthOverflow(fontScale);
  const scrollingEnabled = keyboardVisible || accessibleOverflow;
  const headerContent = typeof header === 'function' ? header({ compact }) : header;
  const bodyContent = typeof children === 'function'
    ? children({ compact, keyboardVisible })
    : children;

  return (
    <SafeAreaView style={authStyles.formSafe} edges={['top', 'right', 'bottom', 'left']}>
      <LinearGradient
        colors={['#FFFFFF', '#FFFFFF', '#F8FBFE']}
        style={authStyles.formGradient}
        testID="auth-form-gradient"
      >
        <View pointerEvents="none" style={authStyles.formDecoration} testID="auth-form-decoration">
          <Svg style={authStyles.formRouteArtwork} width="100%" height="126" viewBox="0 0 375 126">
            <Path
              d="M-18 91 C42 44 83 103 132 77 C178 52 201 112 256 80 C300 55 328 87 393 42"
              fill="none"
              stroke="#F5961D"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="7 8"
              opacity="0.11"
            />
            <Circle cx="132" cy="77" r="7" fill="#FFFFFF" stroke="#F5961D" strokeWidth="3" opacity="0.13" />
            <Path
              d="M328 45 C318 45 311 53 311 63 C311 76 328 91 328 91 C328 91 345 76 345 63 C345 53 338 45 328 45 Z"
              fill="#F5961D"
              opacity="0.12"
            />
            <Circle cx="328" cy="62" r="5" fill="#FFFFFF" opacity="0.8" />
          </Svg>
        </View>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={[authStyles.formShell, compact && authStyles.formShellCompact]}>
            <View
              style={[authStyles.formCard, compact && authStyles.formCardCompact]}
              testID={testID}
            >
              <TouchableOpacity
                style={authStyles.formBackButton}
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="חזרה"
                testID="auth-back-button"
              >
                <Ionicons name="chevron-forward" size={24} color="#1E3A5F" />
              </TouchableOpacity>
              <View style={authStyles.formFixedHeader} testID="auth-form-fixed-header">
                {headerContent}
              </View>
              <ScrollView
                ref={scrollRef}
                style={authStyles.formBodyScroll}
                contentContainerStyle={authStyles.formBodyScrollContent}
                scrollEnabled={scrollingEnabled}
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                testID={accessibleOverflow ? 'auth-accessible-scroll' : 'auth-form-scroll'}
              >
                {bodyContent}
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </LinearGradient>
    </SafeAreaView>
  );
}
