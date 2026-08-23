import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import NavigationChevron from '../../../components/NavigationChevron';
import { colors, routeMapPreviewStyles as styles } from '../../../styles';

export default function RouteMapPreview({ stops, onPress, hiddenStopCount = 0 }) {
  const count = Array.isArray(stops)
    ? stops.filter((stop) => stop?.locationPrecision !== 'general' && (stop?.coordinates || stop?.place?.coordinates)).length
    : 0;
  const preciseLabel = count === 1 ? 'נקודה מדויקת אחת' : `${count} נקודות מדויקות`;
  const hiddenLabel = hiddenStopCount === 1 ? 'עצירה אחת לא מוצגת' : `${hiddenStopCount} עצירות לא מוצגות`;
  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.9} onPress={onPress} testID="route-map-preview">
      <View style={[styles.mapFrame, styles.webFallback]}>
        <Ionicons name="map-outline" size={50} color="rgba(30,58,95,0.18)" />
        <View style={styles.cta}>
          <NavigationChevron size={19} color={colors.textSecondary} />
          <View style={styles.ctaIcon}><Ionicons name="map-outline" size={19} color={colors.primary} /></View>
          <View style={styles.ctaCopy}>
            <AppText style={styles.ctaTitle}>צפייה במפת היום</AppText>
            <AppText style={styles.ctaSubtitle}>
              {preciseLabel}{hiddenStopCount ? ` · ${hiddenLabel}` : ''}
            </AppText>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
