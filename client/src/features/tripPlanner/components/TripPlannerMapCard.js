import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { colors, tripPlannerStyles as styles } from '../../../styles';
import { captureDiagnosticException } from '../../../services/ErrorReporting';
import { coordinatesForStop } from '../utils/tripPlannerModel';
import TripPlannerMap from './TripPlannerMap';

function MapAttempt({ expanded, attempt, onRetry, active, ...mapProps }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const mounted = useRef(true);
  const lifecycle = useRef('layout_pending');
  const reportedFailure = useRef(false);
  const prefix = expanded ? 'trip-map-full' : 'trip-map';
  const pointCount = (mapProps.stops || []).filter(coordinatesForStop).length;

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => { mounted.current = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (ready || !active || !foreground) return undefined;
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      setFailed(true);
      if (reportedFailure.current) return;
      reportedFailure.current = true;
      captureDiagnosticException(new Error('Trip planner map load timed out.'), {
        operation: 'trip_planner_map_load', code: 'map_load_timeout',
        reason: `google_${Platform.OS}_${pointCount}_points_${lifecycle.current}_${expanded ? 'full' : 'inline'}`,
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, [active, expanded, foreground, pointCount, ready]);

  return <>
    <TripPlannerMap {...mapProps} interactive={expanded} attempt={attempt}
      surface={expanded ? 'full' : 'inline'}
      onStageChange={(stage) => { if (mounted.current) lifecycle.current = stage; }}
      onReady={() => {
        if (!mounted.current) return;
        lifecycle.current = 'tiles_loaded'; setReady(true); setFailed(false);
      }} />
    {!ready && !failed ? <View pointerEvents="none" style={[styles.editorMapHint, styles.editorMapLoadingOverlay]} testID={`${prefix}-loading`}>
      <ActivityIndicator color={colors.primary} /><AppText style={styles.editorMapHintText}>טוענים את המפה…</AppText>
    </View> : null}
    {failed ? <View style={[styles.editorMapFailureBanner, expanded && styles.mapFullFailureBanner]} testID={`${prefix}-error`}>
      <Ionicons name="map-outline" size={20} color={colors.primary} /><AppText style={styles.editorMapFailureText}>המפה לא נטענה</AppText>
      <TouchableOpacity style={styles.editorMapRetry} onPress={onRetry} accessibilityRole="button" testID={`${prefix}-retry`}>
        <Ionicons name="refresh" size={17} color={colors.primary} /><AppText style={styles.stopDetailText}>ניסיון נוסף</AppText>
      </TouchableOpacity>
    </View> : null}
  </>;
}

export default function TripPlannerMapCard({ expanded = false, active = true, onExpand, ...mapProps }) {
  const [attempt, setAttempt] = useState(0);
  return <View collapsable={false} style={expanded ? styles.mapFullScreen : styles.editorMapCard}
    testID={expanded ? 'trip-map-full-card' : 'trip-map-card'}>
    <MapAttempt key={attempt} {...mapProps} expanded={expanded} active={active}
      attempt={attempt} onRetry={() => setAttempt((current) => current + 1)} />
    {!expanded && onExpand ? <TouchableOpacity style={styles.editorMapExpand} onPress={onExpand}
      accessibilityRole="button" accessibilityLabel="מפה במסך מלא">
      <Ionicons name="expand-outline" size={18} color={colors.primary} /><AppText style={styles.stopDetailText}>מפה מלאה</AppText>
    </TouchableOpacity> : null}
  </View>;
}
