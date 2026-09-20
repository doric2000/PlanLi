import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Updates from 'expo-updates';

import { colors, tripPlannerStyles as styles } from '../../../styles';
import { addDiagnosticBreadcrumb } from '../../../services/ErrorReporting';
import { coordinatesForStop, regionForStops, routeCoordinates } from '../utils/tripPlannerModel';
import { tripMapCamera } from '../utils/tripMapCamera';

export default function TripPlannerMap({
  stops = [], route, selectedStopId, onSelectStop, onRegionChange, onMapPress, onReady, style,
  interactive = true, onStageChange, surface = 'other', attempt = 0,
}) {
  const mapRef = useRef(null);
  const mountedRef = useRef(true);
  const nativeReadyRef = useRef(false);
  const nativeLayoutRef = useRef(null);
  const tilesLoadedRef = useRef(false);
  const readyReportedRef = useRef(false);
  const appliedCameraKeyRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const [overlaysReady, setOverlaysReady] = useState(false);
  const callbacksRef = useRef({ onReady, onStageChange });
  callbacksRef.current = { onReady, onStageChange };
  const points = useMemo(() => stops.map(coordinatesForStop).filter(Boolean), [stops]);
  const viewportRegion = useMemo(() => regionForStops(stops), [stops]);
  const line = useMemo(() => routeCoordinates(route, stops), [route, stops]);
  const camera = layout ? tripMapCamera(viewportRegion, layout) : null;
  const cameraKey = JSON.stringify(camera);
  const cameraRef = useRef(null);
  cameraRef.current = { camera, cameraKey, layout };
  const diagnosticRef = useRef(null);
  diagnosticRef.current = { surface, attempt, pointCount: points.length };
  const reportStage = useCallback((stage, measuredLayout) => {
    if (!mountedRef.current) return;
    const current = diagnosticRef.current;
    const size = measuredLayout || cameraRef.current.layout;
    const nativeSize = nativeLayoutRef.current;
    callbacksRef.current.onStageChange?.(readyReportedRef.current ? 'tiles_loaded' : appliedCameraKeyRef.current ? 'tiles_pending' : stage);
    addDiagnosticBreadcrumb({ category: 'ui.lifecycle', message: 'Trip map lifecycle', data: {
      operation: 'trip_planner_map_load', screen: 'TripPlanner', status: stage, attempt: current.attempt,
      reason: `${Platform.OS}_${current.surface}_${current.pointCount}_points_host_${Math.round(size?.width || 0)}x${Math.round(size?.height || 0)}_native_${Math.round(nativeSize?.width || 0)}x${Math.round(nativeSize?.height || 0)}`,
    } });
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    addDiagnosticBreadcrumb({ category: 'ui.lifecycle', message: 'Trip map release', data: {
      operation: 'trip_planner_map_load', attempt,
      from: Updates.isEmbeddedLaunch ? 'embedded' : Updates.updateId || 'unknown',
      to: Updates.runtimeVersion || 'unknown', status: 'mount',
    } });
    return () => { mountedRef.current = false; };
  }, [attempt]);
  const reportLoaded = useCallback(() => {
    if (!mountedRef.current || !appliedCameraKeyRef.current || !tilesLoadedRef.current || readyReportedRef.current) return;
    readyReportedRef.current = true;
    // Mount markers and the route only after the bare map has rendered tiles.
    setOverlaysReady(true);
    reportStage('tiles_loaded');
    callbacksRef.current.onReady?.();
  }, [reportStage]);
  const initializeCamera = useCallback(() => {
    const current = cameraRef.current;
    const nativeLayout = nativeLayoutRef.current;
    if (!mountedRef.current || !nativeReadyRef.current || !nativeLayout || !current.camera || !mapRef.current
      || Math.abs(nativeLayout.width - current.layout.width) > 1
      || Math.abs(nativeLayout.height - current.layout.height) > 1
      || appliedCameraKeyRef.current === current.cameraKey) return;
    try {
      // A finite camera does not depend on the native map's first (possibly zero)
      // frame. Apply once after layout + readiness, without waiting for tiles.
      appliedCameraKeyRef.current = current.cameraKey;
      mapRef.current.setCamera(current.camera);
      reportStage(readyReportedRef.current ? 'camera_updated' : 'tiles_pending');
      reportLoaded();
    } catch {
      appliedCameraKeyRef.current = null;
      reportStage('camera_failed');
    }
  }, [reportLoaded, reportStage]);
  useEffect(() => {
    initializeCamera();
  }, [cameraKey, initializeCamera]);
  const handleLayout = useCallback(({ nativeEvent }) => {
    const { width, height } = nativeEvent.layout;
    if (!mountedRef.current || !(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return;
    reportStage('host_layout', { width, height });
    setLayout((current) => current?.width === width && current?.height === height ? current : { width, height });
  }, [reportStage]);
  const handleLoaded = useCallback(() => {
    if (!mountedRef.current) return;
    tilesLoadedRef.current = true;
    reportLoaded();
  }, [reportLoaded]);
  return (
    <View collapsable={false} style={[styles.map, style]} onLayout={handleLayout} testID="trip-map-host">
    {camera ? <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={styles.nativeMap}
      initialCamera={camera}
      onLayout={({ nativeEvent }) => {
        if (!mountedRef.current) return;
        nativeLayoutRef.current = nativeEvent.layout;
        reportStage('native_layout');
        initializeCamera();
      }}
      mapType="standard"
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      zoomTapEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      toolbarEnabled={false}
      onMapReady={() => {
        if (!mountedRef.current || nativeReadyRef.current) return;
        nativeReadyRef.current = true;
        reportStage('native_ready');
        initializeCamera();
      }}
      onMapLoaded={handleLoaded}
      onRegionChangeComplete={(region, details) => {
        if (mountedRef.current) onRegionChange?.(region, details);
      }}
      onPress={(event) => { if (mountedRef.current) onMapPress?.(event?.nativeEvent?.coordinate); }}
      accessibilityLabel="מפת תכנון הטיול"
    >
      {overlaysReady && line.length > 1 ? (
        <Polyline
          coordinates={line}
          strokeColor={colors.primary}
          strokeWidth={4}
          lineDashPattern={route?.segments?.length ? undefined : [7, 7]}
        />
      ) : null}
      {overlaysReady && stops.map((stop, index) => {
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
    </MapView> : null}
    </View>
  );
}
