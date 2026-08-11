import React, { useMemo } from 'react';
import { Linking, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { buildGoogleMapsDirectionsUrls, buildGoogleMapsPlaceUrl, flattenValidRouteStops } from '../utils/routeStops';
import { colors, routeMapStyles as styles } from '../../../styles';

function openUrl(url) {
  if (url) Linking.openURL(url).catch(() => {});
}

export default function RouteMapScreen({ route, navigation }) {
  const { routeData } = route.params || {};
  const stops = useMemo(() => flattenValidRouteStops(routeData), [routeData]);
  const segments = useMemo(() => buildGoogleMapsDirectionsUrls(stops), [stops]);

  return (
    <View style={styles.screen} testID="route-map-web-list">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <AppText style={styles.headerTitle} numberOfLines={1}>{routeData?.Title || 'Route stops'}</AppText>
          <AppText style={styles.headerSubtitle}>{stops.length} stops</AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.emptyState}>
        <Ionicons name="map-outline" size={48} color={colors.textMuted} />
        <AppText style={styles.emptyTitle}>Open this route in Google Maps</AppText>
        <AppText style={styles.emptyText}>The web app lists route stops while the native apps show the interactive Google map.</AppText>
        {segments.map((url, index) => (
          <TouchableOpacity key={url} style={styles.primaryButton} onPress={() => openUrl(url)} testID={`route-map-segment-${index + 1}`}>
            <Ionicons name="navigate-outline" size={18} color={colors.white} />
            <AppText style={styles.primaryButtonText}>Open segment {index + 1}{segments.length > 1 ? ` of ${segments.length}` : ''}</AppText>
          </TouchableOpacity>
        ))}
        {stops.map((stop) => (
          <TouchableOpacity key={stop.id || stop.globalIndex} style={styles.locationNotice} onPress={() => openUrl(buildGoogleMapsPlaceUrl(stop))}>
            <AppText style={styles.locationNoticeText}>{stop.globalIndex + 1}. {stop.title || stop.place?.name || 'Stop'}</AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
