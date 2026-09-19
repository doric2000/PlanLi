import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { colors, tripPlannerStyles as styles } from '../../../styles';
import { coordinatesForStop, regionForStops, routeCoordinates } from '../utils/tripPlannerModel';

export default function TripPlannerMap({
  stops = [], route, selectedStopId, onSelectStop, onRegionChange, onMapPress, onReady, style,
  interactive = true,
}) {
  const mapRef = useRef(null);
  const tilesLoadedRef = useRef(false);
  const readyReportedRef = useRef(false);
  const points = useMemo(() => stops.map(coordinatesForStop).filter(Boolean), [stops]);
  const viewportRegion = useMemo(() => regionForStops(stops), [stops]);
  const line = useMemo(() => routeCoordinates(route, stops), [route, stops]);
  const pointKey = points.map((point) => `${point.latitude}:${point.longitude}`).join('|');
  const updateInteractiveViewport = useCallback((animated) => {
    if (!interactive || !tilesLoadedRef.current || !mapRef.current || points.length < 2) return;
    try {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 40, right: 40, bottom: 45, left: 40 }, animated,
      });
    } catch {
      // Keep the loaded map usable if a native camera command is unavailable.
    }
  }, [interactive, pointKey]);
  useEffect(() => {
    updateInteractiveViewport(true);
  }, [pointKey, updateInteractiveViewport]);
  const handleLoaded = useCallback(() => {
    tilesLoadedRef.current = true;
    updateInteractiveViewport(false);
    if (readyReportedRef.current) return;
    readyReportedRef.current = true;
    onReady?.();
  }, [onReady, updateInteractiveViewport]);
  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={[styles.map, style]}
      initialRegion={viewportRegion}
      mapType="standard"
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      zoomTapEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      toolbarEnabled={false}
      onMapLoaded={handleLoaded}
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
