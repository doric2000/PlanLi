import React from 'react';
import { View, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../../components/AppText';
import { communityDiscoveryStyles as styles } from '../../../styles/communityDiscovery';

export const SortMenuModal = ({ visible, onClose, sortBy, onSelect, personalizationAvailable = false, includeNearby = true }) => {
  const insets = useSafeAreaInsets();
  const content = includeNearby ? 'המלצות' : 'מסלולים';
  const options = [
    ...(personalizationAvailable
      ? [{ key: 'personalized', label: 'בשבילך', description: 'לפי תחומי העניין שלך' }]
      : []),
    { key: 'newest', label: 'הכי חדשים', description: content + ' שנוספו לאחרונה לקהילה' },
    { key: 'popularity', label: 'הכי אהובים', description: content + ' שמטיילים אהבו' },
    ...(includeNearby ? [{ key: 'nearby', label: 'קרוב אליי', description: 'לפי המיקום שלך' }] : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sortOverlay}>
        <Pressable style={styles.sortBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="סגירת מיון" />
        <View style={[styles.sortPanel, { paddingBottom: Math.max(insets.bottom, 20) }]} accessibilityRole="radiogroup" accessibilityLabel="סדר התוצאות">
          <AppText style={[styles.sheetTitle, { flex: 0 }]}>מה תרצו לראות קודם?</AppText>
          {options.map((option) => {
            const selected = sortBy === option.key;
            return (
              <Pressable key={option.key} style={[styles.sortOption, selected && styles.sortSelected]}
                onPress={() => onSelect(option.key)} testID={'community-sort-' + option.key}
                accessibilityRole="radio" accessibilityLabel={option.label + ', ' + option.description}
                accessibilityState={{ checked: selected }} aria-checked={selected}>
                <AppText style={styles.suggestionTitle}>{option.label}</AppText>
                <AppText style={styles.suggestionHint}>{option.description}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
};
