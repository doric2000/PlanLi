import React, { useMemo } from 'react';
import { Alert, Linking, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from './AppText';
import NavigationChevron from './NavigationChevron';
import { colors, openWithLocationSheetStyles as styles } from '../styles';
import { buildGoogleMapsUrl, buildWazeUrl } from '../utils/placeNavigation';

export default function OpenWithLocationSheet({
  visible,
  onClose,
  place,
  destination,
}) {
  const insets = useSafeAreaInsets();
  const options = useMemo(() => {
    const googleUrl = buildGoogleMapsUrl({ place, destination });
    const wazeUrl = buildWazeUrl(place);
    return [
      googleUrl ? { id: 'google', label: 'Google Maps', icon: 'map-outline', url: googleUrl } : null,
      wazeUrl ? { id: 'waze', label: 'Waze', icon: 'navigate-outline', url: wazeUrl } : null,
    ].filter(Boolean);
  }, [destination, place]);

  const openProvider = async (option) => {
    onClose?.();
    try {
      await Linking.openURL(option.url);
    } catch {
      Alert.alert(
        'לא ניתן לפתוח את המפה',
        `לא הצלחנו לפתוח את ${option.label}. אפשר לנסות שוב.`
      );
    }
  };

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        testID="open-with-location-backdrop"
      >
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom || 0, 20) }]}
          onPress={() => {}}
          accessibilityViewIsModal
          testID="open-with-location-sheet"
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerSide}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="סגירת אפשרויות ניווט"
              testID="open-with-location-close"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <AppText style={styles.title}>פתיחה באמצעות</AppText>
            <View style={styles.headerSide} />
          </View>

          <View style={styles.options}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.option}
                onPress={() => openProvider(option)}
                accessibilityRole="button"
                accessibilityLabel={`פתיחה באמצעות ${option.label}`}
                testID={`open-with-location-${option.id}`}
              >
                <Ionicons name={option.icon} size={22} color={colors.primary} />
                <AppText style={styles.optionText}>{option.label}</AppText>
                <NavigationChevron size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
