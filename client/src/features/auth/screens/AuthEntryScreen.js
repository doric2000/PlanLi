import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { forms, common, spacing, typography } from '../../../styles';

function getRootNavigation(navigation) {
  let current = navigation;
  let parent = current?.getParent?.();
  while (parent) {
    current = parent;
    parent = current?.getParent?.();
  }
  return current;
}

export default function AuthEntryScreen({ navigation }) {
  const goTo = useCallback(
    (screen) => {
      const rootNav = getRootNavigation(navigation);
      rootNav?.navigate?.(screen);
    },
    [navigation]
  );

  return (
    <LinearGradient colors={['#1E3A8A', '#3B82F6']} style={forms.authContainer}>
      <SafeAreaView style={forms.authSafeArea}>
        <View style={[forms.authCard, { paddingVertical: 28 }]}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[forms.authTitle, { textAlign: 'right' }]}>ברוכים הבאים</Text>
            <Text style={[forms.authSubtitle, { textAlign: 'right' }]}>התחבר/י או הירשם/י כדי להיכנס לפרופיל</Text>
          </View>

          <View style={{ height: 18 }} />

          <TouchableOpacity onPress={() => goTo('Login')} activeOpacity={0.85}>
            <LinearGradient
              colors={['#1E3A8A', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[forms.authButton, { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10 }]}
            >
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <Text style={forms.authButtonText}>התחברות</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 12 }} />

          <TouchableOpacity onPress={() => goTo('Register')} activeOpacity={0.85} style={forms.authSecondaryButton}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Ionicons name="person-add-outline" size={20} color="#fff" />
              <Text style={forms.authSecondaryButtonText}>הרשמה</Text>
            </View>
          </TouchableOpacity>

          <View style={{ height: 12 }} />

          <Text style={[typography.meta, { textAlign: 'right', color: 'rgba(255,255,255,0.85)' }]}
          >
            כאורח/ת אפשר לצפות בתוכן, אבל פרופיל דורש התחברות.
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
