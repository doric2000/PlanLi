import React, { useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { colors, tripPlannerStyles as styles } from '../../../styles';
import { coordinatesForStop, regionForStops, routeCoordinates } from '../utils/tripPlannerModel';

export default function TripPlannerMap({
  stops = [], route, selectedStopId, onSelectStop, onRegionChange, onMapPress, style,
}) {
  const mapRef = useRef(null);
  const points = useMemo(() => stops.map(coordinatesForStop).filter(Boolean), [stops]);
  const initialRegion = useMemo(() => regionForStops(stops), []);
  const line = useMemo(() => routeCoordinates(route, stops), [route, stops]);
  useEffect(() => {
    if (points.length) mapRef.current?.fitToCoordinates(points, { edgePadding: { top: 130, right: 50, bottom: 330, left: 50 }, animated: true });
  }, [points.length]);
  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      initialRegion={initialRegion}
      onRegionChangeComplete={onRegionChange}
      onPress={(event) => onMapPress?.(event?.nativeEvent?.coordinate)}
      accessibilityLabel="מפת תכנון הטיול"
    >
      {line.length > 1 ? (
        <Polyline
          coordinates={line}
          strokeColor={colors.primary}
          strokeWidth={4}
          lineDashPattern={route?.segments?.length ? undefined : [7, 7]}
        />
      ) : null}
      {stops.map((stop, index) => {
        const coordinate = coordinatesForStop(stop);
        if (!coordinate) return null;
        const custom = stop.sourceType === 'custom';
        return (
          <Marker
            key={stop.id}
            coordinate={coordinate}
            pinColor={custom ? colors.accentAction : colors.primary}
            title={`${index + 1}. ${stop.title}`}
            description={stop.subtitle || undefined}
            opacity={selectedStopId && selectedStopId !== stop.id ? 0.7 : 1}
            onPress={() => onSelectStop?.(stop.id)}
          />
        );
      })}
    </MapView>
  );
}
