import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { colors, routeMapPreviewStyles as styles } from '../../../styles';

export default function RouteMapPreview({ stops, onPress }) {
  const count = Array.isArray(stops) ? stops.length : 0;
  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.9} onPress={onPress} testID="route-map-preview">
      <View style={[styles.mapFrame, styles.webFallback]}>
        <Ionicons name="map-outline" size={50} color="rgba(30,58,95,0.18)" />
        <View style={styles.cta}>
          <View style={styles.ctaIcon}><Ionicons name="map-outline" size={19} color={colors.primary} /></View>
          <View style={styles.ctaCopy}>
            <AppText style={styles.ctaTitle}>פתיחת מפת המסלול</AppText>
            <AppText style={styles.ctaSubtitle}>{count} תחנות על המפה</AppText>
          </View>
          <Ionicons name="chevron-back" size={19} color={colors.textSecondary} />
        </View>
      </View>
    </TouchableOpacity>
  );
}
