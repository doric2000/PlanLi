import React, { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { colors, tripPlannerStyles as styles } from '../../../styles';
import { coordinatesForStop, regionForStops, routeCoordinates } from '../utils/tripPlannerModel';

export default function TripPlannerMap({
  stops = [], route, selectedStopId, onSelectStop, onRegionChange, onMapPress, onReady, style,
}) {
  const mapRef = useRef(null);
  const nativeReadyRef = useRef(false);
  const readyReportedRef = useRef(false);
  const points = useMemo(() => stops.map(coordinatesForStop).filter(Boolean), [stops]);
  const initialRegion = useMemo(() => regionForStops(stops), []);
  const line = useMemo(() => routeCoordinates(route, stops), [route, stops]);
  const pointKey = points.map((point) => `${point.latitude}:${point.longitude}`).join('|');
  const isAndroid = Platform.OS === 'android';
  const reportReady = () => {
    if (readyReportedRef.current) return;
    readyReportedRef.current = true;
    onReady?.();
  };
  useEffect(() => {
    if (nativeReadyRef.current && points.length && mapRef.current) {
      mapRef.current.fitToCoordinates(points, { edgePadding: { top: 40, right: 40, bottom: 45, left: 40 }, animated: true });
    }
  }, [pointKey]);
  return (
    <MapView
      ref={mapRef}
      provider={isAndroid ? PROVIDER_GOOGLE : undefined}
      style={[styles.map, style]}
      initialRegion={initialRegion}
      mapType="standard"
      loadingEnabled
      onMapReady={() => {
        nativeReadyRef.current = true;
        if (points.length) mapRef.current?.fitToCoordinates(points, { edgePadding: { top: 40, right: 40, bottom: 45, left: 40 }, animated: false });
        if (!isAndroid) reportReady();
      }}
      onMapLoaded={isAndroid ? reportReady : undefined}
      onRegionChangeComplete={(region, details) => {
        if (!isAndroid && !nativeReadyRef.current) {
          nativeReadyRef.current = true;
          reportReady();
        }
        onRegionChange?.(region, details);
      }}
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
