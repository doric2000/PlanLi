import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, TouchableOpacity, View } from 'react-native';
import AppText from '../../../components/AppText';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import CachedImage from '../../../components/CachedImage';
import OpenWithLocationSheet from '../../../components/OpenWithLocationSheet';
import RouteStopMarker, { ROUTE_STOP_MARKER_ANCHOR } from '../components/RouteStopMarker';
import { USER_MAP_ZOOM } from '../../../config/mapConfig';
import { useLiveUserLocation } from '../../../hooks/useLiveUserLocation';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import {
  buildGoogleMapsDaySegments,
  buildRouteMapSegments,
  flattenRouteStops,
  formatRouteDuration,
  getRouteInitialRegion,
  getStopCoordinates,
  hasValidStopLocation,
} from '../utils/routeStops';
import { colors, routeMapStyles as styles } from '../../../styles';
import { openSafeExternalUrl } from '../../../utils/safeExternalUrl';

const LOCATION_RETRY_STATUSES = new Set(['denied', 'timeout', 'error']);
const ALL_DAYS = 'all';

function deltaForZoom(zoom) {
  return Math.max(0.002, 360 / (2 ** Number(zoom || USER_MAP_ZOOM)));
}

export const getInitialRegion = getRouteInitialRegion;

export default function RouteMapScreen({ route, navigation }) {
  const { routeData } = route.params || {};
  const days = Array.isArray(routeData?.days) ? routeData.days : [];
  const requestedDayIndex = Number(route?.params?.initialDayIndex);
  const initialDayIndex = Number.isInteger(requestedDayIndex) && requestedDayIndex >= 0 && requestedDayIndex < days.length
    ? requestedDayIndex
    : 0;
  const [selectedDay, setSelectedDay] = useState(initialDayIndex);
  const allStops = useMemo(() => flattenRouteStops(routeData), [routeData]);
  const selectedStops = useMemo(() => selectedDay === ALL_DAYS
    ? allStops
    : allStops.filter((stop) => stop.dayIndex === selectedDay), [allStops, selectedDay]);
  const stops = useMemo(() => selectedStops.filter(hasValidStopLocation), [selectedStops]);
  const hiddenStopCount = Math.max(0, selectedStops.length - stops.length);
  const mapSegments = useMemo(() => buildRouteMapSegments(
    routeData,
    selectedDay === ALL_DAYS ? null : selectedDay
  ), [routeData, selectedDay]);
  const dayDirections = useMemo(() => selectedDay === ALL_DAYS
    ? []
    : buildGoogleMapsDaySegments(routeData, selectedDay), [routeData, selectedDay]);
  const routeRegion = useMemo(() => getInitialRegion(stops), [stops]);
  const [selectedStop, setSelectedStop] = useState(null);
  const [navigationStop, setNavigationStop] = useState(null);
  const [directionsVisible, setDirectionsVisible] = useState(false);
  const [mapInstance, setMapInstance] = useState(0);
  const initialRegionRef = useRef(routeRegion);
  const { location, status, startTracking, stopTracking } = useLiveUserLocation();

  useEffect(() => {
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  useEffect(() => {
    initialRegionRef.current = routeRegion;
    setSelectedStop(null);
    setMapInstance((value) => value + 1);
  }, [routeRegion]);

  useEffect(() => {
    if (selectedDay !== ALL_DAYS && selectedDay >= days.length) setSelectedDay(0);
  }, [days.length, selectedDay]);

  const openUrl = useCallback(async (url) => {
    if (!url) return;
    try {
      await openSafeExternalUrl(url, 'googleMaps');
    } catch {
      Alert.alert('לא ניתן לפתוח את המפה', 'לא הצלחנו לפתוח את Google Maps. אפשר לנסות שוב.');
    }
  }, []);

  const openDayDirections = useCallback(() => {
    if (dayDirections.length === 1) {
      openUrl(dayDirections[0].url);
      return;
    }
    if (dayDirections.length > 1) setDirectionsVisible(true);
  }, [dayDirections, openUrl]);

  const remountAtRegion = useCallback((region) => {
    initialRegionRef.current = region;
    setSelectedStop(null);
    setMapInstance((value) => value + 1);
  }, []);

  const centerOnUser = useCallback(() => {
    if (!location) {
      startTracking();
      return;
    }
    const delta = deltaForZoom(USER_MAP_ZOOM);
    remountAtRegion({
      latitude: location.lat,
      longitude: location.lng,
      latitudeDelta: delta,
      longitudeDelta: delta,
    });
  }, [location, remountAtRegion, startTracking]);

  const fitRoute = useCallback(() => remountAtRegion(routeRegion), [remountAtRegion, routeRegion]);
  const title = routeData?.title || routeData?.Title || 'מפת המסלול';

  if (!routeData || !days.length) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} testID="route-map-unavailable">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton} accessibilityLabel="חזרה למסלול">
            <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>המפה אינה זמינה</AppText>
          <View style={styles.headerActionSpacer} />
        </View>
        <View style={styles.emptyState}><AppText style={styles.emptyTitle}>לא הצלחנו לטעון את פרטי המסלול.</AppText></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton} accessibilityLabel="חזרה למסלול">
          <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <AppText style={styles.headerTitle} numberOfLines={1}>{title}</AppText>
          <AppText style={styles.headerSubtitle}>
            {selectedDay === ALL_DAYS ? 'כל המסלול' : `יום ${selectedDay + 1}`} · {stops.length === 1 ? 'נקודה מדויקת אחת' : `${stops.length} נקודות מדויקות`}
          </AppText>
        </View>
        {selectedDay !== ALL_DAYS ? (
          <TouchableOpacity
            onPress={openDayDirections}
            disabled={!dayDirections.length}
            style={[styles.headerActionButton, !dayDirections.length && styles.headerActionButtonDisabled]}
            accessibilityRole="button"
            testID="route-map-open-day"
          >
            <AppText style={[styles.headerActionText, !dayDirections.length && styles.headerActionTextDisabled]}>פתיחת היום</AppText>
          </TouchableOpacity>
        ) : <View style={styles.headerActionSpacer} />}
      </View>

      {days.length > 1 ? (
        <View style={styles.mapDayTabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mapDayTabs}>
            {days.map((day, index) => {
              const active = selectedDay === index;
              return (
                <Pressable
                  key={day?.id || `map-day-${index}`}
                  style={[styles.mapDayTab, active && styles.mapDayTabActive]}
                  onPress={() => setSelectedDay(index)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  testID={`route-map-day-${index}`}
                >
                  <AppText style={[styles.mapDayTabText, active && styles.mapDayTabTextActive]}>יום {index + 1}</AppText>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.mapDayTab, selectedDay === ALL_DAYS && styles.mapDayTabActive]}
              onPress={() => setSelectedDay(ALL_DAYS)}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedDay === ALL_DAYS }}
              testID="route-map-all-days"
            >
              <AppText style={[styles.mapDayTabText, selectedDay === ALL_DAYS && styles.mapDayTabTextActive]}>כל המסלול</AppText>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}

      {stops.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="map-outline" size={54} color={colors.textMuted} />
          <AppText style={styles.emptyTitle}>אין נקודות מדויקות להצגה</AppText>
          <AppText style={styles.emptyText}>העצירות עדיין מופיעות בתוכנית היום, גם כשהמיקום שלהן כללי.</AppText>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapView
            key={`route-map-${mapInstance}`}
            style={styles.map}
            initialRegion={initialRegionRef.current}
            provider={PROVIDER_GOOGLE}
            mapType="standard"
            showsUserLocation
            showsMyLocationButton={false}
            onPress={() => setSelectedStop(null)}
            testID="route-map"
          >
            {!!location?.accuracy && (
              <Circle
                center={{ latitude: location.lat, longitude: location.lng }}
                radius={Math.max(1, Number(location.accuracy))}
                fillColor="rgba(47,128,237,0.12)"
                strokeColor="rgba(47,128,237,0.32)"
                strokeWidth={1}
              />
            )}

            {mapSegments.filter((segment) => segment.coordinates.length > 1).map((segment) => (
              <Polyline
                key={segment.id}
                coordinates={segment.coordinates.map((coordinates) => ({ latitude: coordinates.lat, longitude: coordinates.lng }))}
                strokeColor={colors.primary}
                strokeWidth={3}
                lineDashPattern={[8, 7]}
                testID={`map-route-line-${segment.id}`}
              />
            ))}

            {stops.map((stop) => {
              const coordinates = getStopCoordinates(stop);
              const markerId = selectedDay === ALL_DAYS
                ? `${stop.dayIndex + 1}-${stop.stopIndex + 1}`
                : `${stop.stopIndex + 1}`;
              return (
                <Marker
                  key={stop.id || `${stop.dayIndex}:${stop.stopIndex}`}
                  testID={`route-map-marker-${markerId}`}
                  coordinate={{ latitude: coordinates.lat, longitude: coordinates.lng }}
                  onPress={() => setSelectedStop(stop)}
                  stopPropagation
                  anchor={ROUTE_STOP_MARKER_ANCHOR}
                >
                  <RouteStopMarker
                    stop={stop}
                    selected={selectedStop?.dayIndex === stop.dayIndex && selectedStop?.stopIndex === stop.stopIndex}
                    displayNumber={stop.stopIndex + 1}
                    displayDayNumber={selectedDay === ALL_DAYS ? stop.dayIndex + 1 : null}
                  />
                </Marker>
              );
            })}
          </MapView>

          <View style={[styles.mapControls, selectedStop ? styles.mapControlsSelected : styles.mapControlsDefault]} pointerEvents="box-none" testID="route-map-controls">
            <TouchableOpacity style={styles.mapControlButton} onPress={centerOnUser} accessibilityRole="button" accessibilityLabel="המיקום שלי" testID="route-map-my-location">
              <Ionicons name="locate" size={21} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapControlButton} onPress={fitRoute} accessibilityRole="button" accessibilityLabel="הצגת הנקודות שנבחרו" testID="route-map-fit-route">
              <Ionicons name="expand-outline" size={21} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {!!hiddenStopCount && !selectedStop ? (
            <View style={styles.mapHiddenNotice} testID="route-map-hidden-notice">
              <AppText style={styles.mapHiddenNoticeText}>
                {hiddenStopCount === 1
                  ? 'עצירה אחת אינה מוצגת כי אין לה נקודה מדויקת.'
                  : `${hiddenStopCount} עצירות אינן מוצגות כי אין להן נקודה מדויקת.`}
              </AppText>
            </View>
          ) : null}

          {LOCATION_RETRY_STATUSES.has(status) && (
            <TouchableOpacity style={styles.locationNotice} onPress={startTracking}>
              <AppText style={styles.locationNoticeText}>הפעילו מיקום כדי לראות היכן אתם ביחס למסלול</AppText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!selectedStop && (
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setSelectedStop(null)} style={styles.sheetCloseButton} accessibilityLabel="סגירת פרטי העצירה">
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.sheetTitleWrap}>
              <AppText style={styles.sheetKicker}>יום {selectedStop.dayIndex + 1} · עצירה {selectedStop.stopIndex + 1}</AppText>
              <AppText style={styles.sheetTitle} numberOfLines={2}>{selectedStop.title}</AppText>
            </View>
            {selectedStop.image || selectedStop.media ? (
              <CachedImage source={{ uri: getMediaVariantUrl(selectedStop.media, 'thumb', selectedStop.image) }} style={styles.sheetImage} contentFit="cover" priority="high" />
            ) : (
              <View style={styles.sheetImageFallback}><AppText style={styles.sheetImageFallbackText}>{selectedStop.stopIndex + 1}</AppText></View>
            )}
          </View>
          {[selectedStop.startTime, formatRouteDuration(selectedStop.durationMinutes)].filter(Boolean).length ? (
            <AppText style={styles.sheetMeta}>{[selectedStop.startTime, formatRouteDuration(selectedStop.durationMinutes)].filter(Boolean).join(' · ')}</AppText>
          ) : null}
          <AppText style={styles.sheetAddress} numberOfLines={2}>{selectedStop.place?.address || selectedStop.location || selectedStop.place?.name}</AppText>
          {!!selectedStop.description && <AppText style={styles.sheetDescription} numberOfLines={3}>{selectedStop.description}</AppText>}
          <TouchableOpacity style={styles.primaryButton} onPress={() => setNavigationStop(selectedStop)} accessibilityRole="button">
            <Ionicons name="navigate-outline" size={18} color={colors.white} />
            <AppText style={styles.primaryButtonText}>אפשרויות ניווט</AppText>
          </TouchableOpacity>
        </View>
      )}

      <OpenWithLocationSheet
        visible={Boolean(navigationStop)}
        onClose={() => setNavigationStop(null)}
        place={navigationStop ? {
          ...(navigationStop.place || {}),
          name: navigationStop.place?.name || navigationStop.title || navigationStop.location,
          address: navigationStop.place?.address || navigationStop.location,
          coordinates: getStopCoordinates(navigationStop),
        } : null}
        destination={navigationStop?.destination || null}
      />

      <Modal visible={directionsVisible} transparent animationType="slide" onRequestClose={() => setDirectionsVisible(false)}>
        <Pressable style={styles.segmentOverlay} onPress={() => setDirectionsVisible(false)}>
          <Pressable style={styles.segmentSheet} onPress={() => {}} accessibilityViewIsModal>
            <View style={styles.segmentHandle} />
            <AppText style={styles.segmentTitle}>פתיחת יום {Number(selectedDay) + 1} ב־Google Maps</AppText>
            <AppText style={styles.segmentDescription}>היום מחולק לקטעים כדי לא לחבר דרך מיקומים כלליים או לעבור את מגבלת העצירות.</AppText>
            {dayDirections.map((segment, index) => (
              <TouchableOpacity
                key={segment.id}
                style={styles.segmentOption}
                onPress={() => { setDirectionsVisible(false); openUrl(segment.url); }}
                accessibilityRole="button"
                testID={`route-map-segment-${index + 1}`}
              >
                <Ionicons name="map-outline" size={20} color={colors.primary} />
                <View style={styles.segmentOptionCopy}>
                  <AppText style={styles.segmentOptionTitle}>קטע {index + 1}</AppText>
                  <AppText style={styles.segmentOptionText}>עצירות {segment.startStopIndex + 1}–{segment.endStopIndex + 1}</AppText>
                </View>
                <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
