import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { colors, tripPlannerStyles as styles } from '../../../styles';
import { coordinatesForStop, regionForStops, routeCoordinates } from '../utils/tripPlannerModel';

export default function TripPlannerMap({
  stops = [], route, selectedStopId, onSelectStop, onRegionChange, onMapPress, onReady, style,
  interactive = true,
}) {
  const mapRef = useRef(null);
  const nativeReadyRef = useRef(false);
  const readyReportedRef = useRef(false);
  const points = useMemo(() => stops.map(coordinatesForStop).filter(Boolean), [stops]);
  const viewportRegion = useMemo(() => regionForStops(stops), [stops]);
  const line = useMemo(() => routeCoordinates(route, stops), [route, stops]);
  const pointKey = points.map((point) => `${point.latitude}:${point.longitude}`).join('|');
  const isAndroid = Platform.OS === 'android';
  const reportReady = useCallback(() => {
    if (readyReportedRef.current) return;
    readyReportedRef.current = true;
    onReady?.();
  }, [onReady]);
  const updateInteractiveViewport = useCallback((animated) => {
    if (!interactive || !nativeReadyRef.current || !mapRef.current) return;
    try {
      if (points.length > 1) {
        mapRef.current.fitToCoordinates(points, {
          edgePadding: { top: 40, right: 40, bottom: 45, left: 40 }, animated,
        });
      } else if (points.length === 1 && animated) {
        mapRef.current.animateToRegion({ ...points[0], latitudeDelta: 0.06, longitudeDelta: 0.06 }, 250);
      }
    } catch {
      // Readiness must not be hidden when a native camera command is unavailable.
    }
  }, [interactive, pointKey]);
  useEffect(() => {
    updateInteractiveViewport(true);
  }, [pointKey, updateInteractiveViewport]);
  const handleReady = () => {
    nativeReadyRef.current = true;
    reportReady();
    updateInteractiveViewport(false);
  };
  return (
    <MapView
      ref={mapRef}
      provider={isAndroid ? PROVIDER_GOOGLE : undefined}
      style={[styles.map, style]}
      {...(interactive ? { initialRegion: viewportRegion } : { region: viewportRegion })}
      mapType="standard"
      loadingEnabled
      cacheEnabled={!interactive && !isAndroid}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      zoomTapEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      toolbarEnabled={false}
      onMapReady={isAndroid ? undefined : handleReady}
      onMapLoaded={handleReady}
      onRegionChangeComplete={(region, details) => {
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
