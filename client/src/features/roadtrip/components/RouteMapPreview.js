import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import NavigationChevron from '../../../components/NavigationChevron';
import { colors, routeMapPreviewStyles as styles } from '../../../styles';
import {
  getRouteInitialRegion,
  getStopCoordinates,
  hasValidStopLocation,
  splitContiguousMappableStops,
} from '../utils/routeStops';
import RouteStopMarker, { COMPACT_ROUTE_STOP_MARKER_ANCHOR } from './RouteStopMarker';

export default function RouteMapPreview({ stops, onPress, hiddenStopCount = 0 }) {
  const allStops = Array.isArray(stops) ? stops : [];
  const routeStops = useMemo(() => allStops.filter(hasValidStopLocation), [allStops]);
  const visibleStops = routeStops.slice(0, 12);
  const segments = useMemo(() => splitContiguousMappableStops(allStops), [allStops]);
  const region = useMemo(() => getRouteInitialRegion(routeStops), [routeStops]);
  const extraMarkerCount = Math.max(0, routeStops.length - visibleStops.length);
  const preciseLabel = routeStops.length === 1 ? 'נקודה מדויקת אחת' : `${routeStops.length} נקודות מדויקות`;
  const extraLabel = extraMarkerCount === 1 ? 'ועוד נקודה במפה המלאה' : `ועוד ${extraMarkerCount} נקודות במפה המלאה`;
  const hiddenLabel = hiddenStopCount === 1 ? 'עצירה אחת לא מוצגת' : `${hiddenStopCount} עצירות לא מוצגות`;

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
          {segments.filter((segment) => segment.length > 1).map((segment, index) => (
            <Polyline
              key={`preview-segment-${index}`}
              coordinates={segment.map((stop) => {
                const coordinates = getStopCoordinates(stop);
                return { latitude: coordinates.lat, longitude: coordinates.lng };
              })}
              strokeColor={colors.primary}
              strokeWidth={3}
              lineDashPattern={[7, 7]}
            />
          ))}
          {visibleStops.map((stop) => {
            const coordinates = getStopCoordinates(stop);
            return (
            <Marker
              key={stop.id || `${stop.dayIndex}:${stop.stopIndex}`}
              testID={`route-map-preview-marker-${stop.stopIndex + 1}`}
              coordinate={{ latitude: coordinates.lat, longitude: coordinates.lng }}
              anchor={COMPACT_ROUTE_STOP_MARKER_ANCHOR}
            >
              <RouteStopMarker stop={stop} displayNumber={stop.stopIndex + 1} compact />
            </Marker>
            );
          })}
        </MapView>
        <View style={styles.mapShade} />
        <View style={styles.cta}>
          <NavigationChevron size={19} color={colors.textSecondary} />
          <View style={styles.ctaIcon}>
            <Ionicons name="map-outline" size={19} color={colors.primary} />
          </View>
          <View style={styles.ctaCopy}>
            <AppText style={styles.ctaTitle}>צפייה במפת היום</AppText>
            <AppText style={styles.ctaSubtitle}>
              {preciseLabel}
              {extraMarkerCount ? ` · ${extraLabel}` : ''}
              {hiddenStopCount ? ` · ${hiddenLabel}` : ''}
            </AppText>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
