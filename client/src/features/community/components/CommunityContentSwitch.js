import React from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { mainNavigationStyles as styles, navigationPalette as c } from '../../../styles/mainNavigationStyles';

const MODES = [
  { name: 'CommunityFeed', label: 'המלצות', icon: 'thumbs-up-outline', id: 'recommendations' },
  { name: 'Routes', label: 'מסלולים', icon: 'map-outline', id: 'routes' },
];

export default function CommunityContentSwitch({ navigation, selected }) {
  return (
    <View style={styles.modeWrap}>
      <View style={styles.modes} testID="community-content-switch">
        {MODES.map((mode) => {
          const active = selected === mode.name;
          return (
            <Pressable
              key={mode.name} testID={`community-mode-${mode.id}`}
              accessibilityRole="tab" accessibilityLabel={mode.label} accessibilityState={{ selected: active }} aria-selected={active}
              onPress={() => { Keyboard.dismiss(); if (!active) navigation.navigate(mode.name); }}
              style={({ pressed }) => [styles.mode, active && styles.modeSelected, pressed && styles.pressed]}
            >
              <Ionicons name={mode.icon} size={20} color={active ? c.white : c.navy} />
              <AppText style={[styles.modeText, active && styles.modeTextSelected]}>{mode.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
