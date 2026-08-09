import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  TransformRequestManager,
} from '@maplibre/maplibre-react-native';

import CachedImage from '../../../components/CachedImage';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapTilerKey,
  getMapTilerStyleUrl,
  USER_MAP_ZOOM,
} from '../../../config/mapConfig';
import { useLiveUserLocation } from '../../../hooks/useLiveUserLocation';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import { userLocationGeoJson } from '../../../utils/mapGeoJson';
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPlaceUrl,
  flattenValidRouteStops,
} from '../utils/routeStops';
import { routeBounds, routeLineGeoJson, routeStopsToGeoJson } from '../utils/routeMap';
import { colors, routeMapStyles as styles } from '../../../styles';

const MOBILE_KEY = getMapTilerKey('native');
const MAP_STYLE = getMapTilerStyleUrl(MOBILE_KEY);

if (MOBILE_KEY) {
  TransformRequestManager.addHeader({
    id: 'planli-maptiler-user-agent',
    match: '^https://api\\.maptiler\\.com/',
    name: 'User-Agent',
    value: 'PlanLi/1.0 (com.planli.planlitravels)',
  });
}

export default function RouteMapScreen({ route, navigation }) {
  const { routeData } = route.params || {};
  const stops = useMemo(() => flattenValidRouteStops(routeData), [routeData]);
  const stopsById = useMemo(() => new Map(stops.map((stop) => [
    String(stop.id || `${stop.dayIndex}:${stop.stopIndex}`),
    stop,
  ])), [stops]);
  const stopsGeoJson = useMemo(() => routeStopsToGeoJson(stops), [stops]);
  const lineGeoJson = useMemo(() => routeLineGeoJson(stops), [stops]);
  const bounds = useMemo(() => routeBounds(stops), [stops]);
  const [selectedStop, setSelectedStop] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const { location, status, startTracking, stopTracking } = useLiveUserLocation();
  const userGeoJson = useMemo(() => userLocationGeoJson(location), [location]);
  const routeUrl = buildGoogleMapsDirectionsUrl(stops);

  const openUrl = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const fitRoute = useCallback(() => {
    if (!bounds) return;
    cameraRef.current?.fitBounds?.(bounds, {
      padding: { top: 54, right: 34, bottom: 82, left: 34 },
      duration: 650,
    });
  }, [bounds]);

  const centerOnUser = useCallback(() => {
    if (!location) {
      startTracking();
      return;
    }
    cameraRef.current?.flyTo?.({
      center: [location.lng, location.lat],
      zoom: USER_MAP_ZOOM,
      duration: 650,
    });
  }, [location, startTracking]);

  useEffect(() => {
    if (!MAP_STYLE) return undefined;
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  useEffect(() => {
    if (mapReady && bounds) fitRoute();
  }, [bounds, fitRoute, mapReady]);

  const handleStopPress = useCallback((event) => {
    event?.stopPropagation?.();
    const feature = event?.nativeEvent?.features?.[0] || event?.features?.[0];
    const id = String(feature?.properties?.id || '');
    setSelectedStop(stopsById.get(id) || null);
  }, [stopsById]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {routeData?.Title || 'מפת מסלול'}
          </Text>
          <Text style={styles.headerSubtitle}>{stops.length} תחנות עם מיקום</Text>
        </View>
        <TouchableOpacity
          onPress={() => openUrl(routeUrl)}
          disabled={stops.length < 2}
          style={[styles.headerActionButton, stops.length < 2 && styles.headerActionButtonDisabled]}
        >
          <Text style={[styles.headerActionText, stops.length < 2 && styles.headerActionTextDisabled]}>
            פתח הכל
          </Text>
        </TouchableOpacity>
      </View>

      {stops.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="map-outline" size={54} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>אין תחנות להצגה במפה</Text>
          <Text style={styles.emptyText}>הוסיפו תחנות עם מיקום מדויק בתוך ימי המסלול.</Text>
        </View>
      ) : !MAP_STYLE ? (
        <View style={styles.emptyState} testID="route-map-missing-key">
          <Ionicons name="map-outline" size={54} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>המפה עדיין לא הוגדרה</Text>
          <Text style={styles.emptyText}>יש להוסיף מפתח MapTiler מוגן לבניית המובייל.</Text>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapLibreMap
            ref={mapRef}
            style={styles.map}
            mapStyle={MAP_STYLE}
            logo={false}
            attribution
            attributionPosition={{ top: 8, left: 8 }}
            compass
            compassPosition={{ top: 8, right: 8 }}
            touchPitch={false}
            onDidFinishLoadingMap={() => setMapReady(true)}
            onPress={() => setSelectedStop(null)}
            testID="route-map"
          >
            <Camera
              ref={cameraRef}
              minZoom={2}
              maxZoom={20}
              initialViewState={{ center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM }}
            />
            <GeoJSONSource id="route-user-location" data={userGeoJson}>
              <Layer
                id="route-user-accuracy"
                type="fill"
                filter={['==', ['geometry-type'], 'Polygon']}
                paint={{ 'fill-color': '#2F80ED', 'fill-opacity': 0.12 }}
              />
              <Layer
                id="route-user-ring"
                type="circle"
                filter={['==', ['get', 'kind'], 'user']}
                paint={{ 'circle-radius': 10, 'circle-color': '#FFFFFF' }}
              />
              <Layer
                id="route-user-dot"
                type="circle"
                filter={['==', ['get', 'kind'], 'user']}
                paint={{ 'circle-radius': 6.5, 'circle-color': '#2F80ED' }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="route-line" data={lineGeoJson}>
              <Layer
                id="route-line-layer"
                type="line"
                paint={{
                  'line-color': colors.primary,
                  'line-width': 4,
                  'line-opacity': 0.88,
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource
              id="route-stops"
              data={stopsGeoJson}
              onPress={handleStopPress}
              hitbox={{ top: 18, right: 18, bottom: 18, left: 18 }}
            >
              <Layer
                id="route-stop-circles"
                type="circle"
                paint={{
                  'circle-radius': 16,
                  'circle-color': colors.primary,
                  'circle-stroke-color': '#FFFFFF',
                  'circle-stroke-width': 3,
                }}
              />
              <Layer
                id="route-stop-numbers"
                type="symbol"
                layout={{
                  'text-field': ['get', 'stopNumber'],
                  'text-size': 13,
                  'text-allow-overlap': true,
                }}
                paint={{ 'text-color': '#FFFFFF' }}
              />
            </GeoJSONSource>
          </MapLibreMap>

          <View style={styles.mapControls} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.mapControlButton}
              onPress={centerOnUser}
              accessibilityRole="button"
              accessibilityLabel="המיקום שלי"
              testID="route-map-my-location"
            >
              <Ionicons name="locate" size={21} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mapControlButton}
              onPress={fitRoute}
              accessibilityRole="button"
              accessibilityLabel="הצג את כל המסלול"
            >
              <Ionicons name="expand-outline" size={21} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {status === 'denied' && (
            <TouchableOpacity style={styles.locationNotice} onPress={startTracking}>
              <Text style={styles.locationNoticeText}>הפעילו מיקום כדי לראות היכן אתם ביחס למסלול</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!selectedStop && (
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setSelectedStop(null)} style={styles.sheetCloseButton}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.sheetTitleWrap}>
              <Text style={styles.sheetKicker}>יום {selectedStop.dayIndex + 1} · תחנה {selectedStop.stopIndex + 1}</Text>
              <Text style={styles.sheetTitle} numberOfLines={2}>{selectedStop.title}</Text>
            </View>
            {selectedStop.image || selectedStop.media ? (
              <CachedImage
                source={{ uri: getMediaVariantUrl(selectedStop.media, 'thumb', selectedStop.image) }}
                style={styles.sheetImage}
                contentFit="cover"
                priority="high"
              />
            ) : (
              <View style={styles.sheetImageFallback}>
                <Text style={styles.sheetImageFallbackText}>{selectedStop.globalIndex + 1}</Text>
              </View>
            )}
          </View>
          <Text style={styles.sheetAddress} numberOfLines={2}>
            {selectedStop.place?.address || selectedStop.location || selectedStop.place?.name}
          </Text>
          {!!selectedStop.description && (
            <Text style={styles.sheetDescription} numberOfLines={3}>{selectedStop.description}</Text>
          )}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => openUrl(buildGoogleMapsPlaceUrl(selectedStop))}
          >
            <Ionicons name="map-outline" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>פתח בגוגל מפות</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
