import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { colors, routeMapPreviewStyles as styles } from '../../../styles';
import { getRouteInitialRegion } from '../utils/routeStops';
import RouteStopMarker from './RouteStopMarker';

export default function RouteMapPreview({ stops, onPress }) {
  const routeStops = Array.isArray(stops) ? stops : [];
  const region = useMemo(() => getRouteInitialRegion(routeStops), [routeStops]);
  const coordinates = useMemo(() => routeStops.map((stop) => ({
    latitude: stop.coordinates.lat,
    longitude: stop.coordinates.lng,
  })), [routeStops]);

  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.9} onPress={onPress} testID="route-map-preview">
      <View style={styles.mapFrame} pointerEvents="none">
        <MapView
          style={styles.map}
          initialRegion={region}
          provider={PROVIDER_GOOGLE}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
        >
          {coordinates.length > 1 ? (
            <Polyline coordinates={coordinates} strokeColor={colors.primary} strokeWidth={4} />
          ) : null}
          {routeStops.slice(0, 8).map((stop, index) => (
            <Marker
              key={stop.id || `${stop.dayIndex}:${stop.stopIndex}`}
              testID={`route-map-preview-marker-${stop.globalIndex + 1}`}
              coordinate={coordinates[index]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <RouteStopMarker stop={stop} compact />
            </Marker>
          ))}
        </MapView>
        <View style={styles.mapShade} />
        <View style={styles.cta}>
          <View style={styles.ctaIcon}>
            <Ionicons name="map-outline" size={19} color={colors.primary} />
          </View>
          <View style={styles.ctaCopy}>
            <AppText style={styles.ctaTitle}>פתיחת מפת המסלול</AppText>
            <AppText style={styles.ctaSubtitle}>{routeStops.length} תחנות על המפה</AppText>
          </View>
          <Ionicons name="chevron-back" size={19} color={colors.textSecondary} />
        </View>
      </View>
    </TouchableOpacity>
  );
}
