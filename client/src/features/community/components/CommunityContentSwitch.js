import React from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/AppText';
import { mainNavigationStyles as styles, navigationPalette as c } from '../../../styles/mainNavigationStyles';
import { communityDiscoveryStyles as compactStyles } from '../../../styles/communityDiscovery';

const MODES = [
  { name: 'CommunityFeed', label: 'המלצות', icon: 'thumbs-up-outline', id: 'recommendations' },
  { name: 'Routes', label: 'מסלולים', icon: 'map-outline', id: 'routes' },
];

export default function CommunityContentSwitch({ navigation, selected, compact = false }) {
  const s = compact ? compactStyles : styles;
  return (
    <View style={s.modeWrap}>
      <View style={s.modes} testID="community-content-switch">
        {MODES.map((mode) => {
          const active = selected === mode.name;
          return (
            <Pressable
              key={mode.name} testID={`community-mode-${mode.id}`}
              accessibilityRole="tab" accessibilityLabel={mode.label} accessibilityState={{ selected: active }} aria-selected={active}
              onPress={() => { Keyboard.dismiss(); if (!active) navigation.navigate(mode.name); }}
              style={({ pressed }) => [s.mode, active && s.modeSelected, pressed && styles.pressed]}
            >
              <Ionicons name={mode.icon} size={compact ? 19 : 20} color={compact ? active ? c.navy : c.white : active ? c.white : c.navy} />
              <AppText style={[s.modeText, active && (compact ? compactStyles.selectedText : styles.modeTextSelected)]}>{mode.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
