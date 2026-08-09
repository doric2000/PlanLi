import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

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

const WEB_KEY = getMapTilerKey('web');
const MAP_STYLE = getMapTilerStyleUrl(WEB_KEY);

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
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const stopsByIdRef = useRef(stopsById);
  const stopsDataRef = useRef(stopsGeoJson);
  const lineDataRef = useRef(lineGeoJson);
  const { location, status, startTracking, stopTracking } = useLiveUserLocation();
  const userGeoJson = useMemo(() => userLocationGeoJson(location), [location]);
  const userDataRef = useRef(userGeoJson);
  const routeUrl = buildGoogleMapsDirectionsUrl(stops);
  stopsByIdRef.current = stopsById;
  stopsDataRef.current = stopsGeoJson;
  lineDataRef.current = lineGeoJson;
  userDataRef.current = userGeoJson;

  const openUrl = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const fitRoute = useCallback(() => {
    if (!bounds || !mapRef.current) return;
    mapRef.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
      padding: { top: 54, right: 34, bottom: 82, left: 34 },
      duration: 650,
      maxZoom: 16,
    });
  }, [bounds]);

  const centerOnUser = useCallback(() => {
    if (!location) {
      startTracking();
      return;
    }
    mapRef.current?.flyTo({ center: [location.lng, location.lat], zoom: USER_MAP_ZOOM, duration: 650 });
  }, [location, startTracking]);

  useEffect(() => {
    if (!MAP_STYLE) return undefined;
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  useEffect(() => {
    if (!MAP_STYLE || !containerRef.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      minZoom: 2,
      maxZoom: 20,
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'top-right');
    const onLoad = () => {
      map.addSource('route-user-location', { type: 'geojson', data: userDataRef.current });
      map.addLayer({
        id: 'route-user-accuracy', type: 'fill', source: 'route-user-location',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2F80ED', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'route-user-ring', type: 'circle', source: 'route-user-location',
        filter: ['==', ['get', 'kind'], 'user'],
        paint: { 'circle-radius': 10, 'circle-color': '#FFFFFF' },
      });
      map.addLayer({
        id: 'route-user-dot', type: 'circle', source: 'route-user-location',
        filter: ['==', ['get', 'kind'], 'user'],
        paint: { 'circle-radius': 6.5, 'circle-color': '#2F80ED' },
      });
      map.addSource('route-line', { type: 'geojson', data: lineDataRef.current });
      map.addLayer({
        id: 'route-line-layer', type: 'line', source: 'route-line',
        paint: { 'line-color': colors.primary, 'line-width': 4, 'line-opacity': 0.88 },
      });
      map.addSource('route-stops', { type: 'geojson', data: stopsDataRef.current });
      map.addLayer({
        id: 'route-stop-circles', type: 'circle', source: 'route-stops',
        paint: {
          'circle-radius': 16,
          'circle-color': colors.primary,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'route-stop-numbers', type: 'symbol', source: 'route-stops',
        layout: { 'text-field': ['get', 'stopNumber'], 'text-size': 13, 'text-allow-overlap': true },
        paint: { 'text-color': '#FFFFFF' },
      });
      map.on('click', 'route-stop-circles', (event) => {
        const id = String(event.features?.[0]?.properties?.id || '');
        setSelectedStop(stopsByIdRef.current.get(id) || null);
      });
      map.on('click', (event) => {
        const hit = map.queryRenderedFeatures(event.point, { layers: ['route-stop-circles'] });
        if (!hit.length) setSelectedStop(null);
      });
      setMapReady(true);
    };
    map.on('load', onLoad);
    return () => {
      map.off('load', onLoad);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.getSource?.('route-stops')?.setData?.(stopsGeoJson);
    mapRef.current?.getSource?.('route-line')?.setData?.(lineGeoJson);
  }, [lineGeoJson, stopsGeoJson]);

  useEffect(() => {
    mapRef.current?.getSource?.('route-user-location')?.setData?.(userGeoJson);
  }, [userGeoJson]);

  useEffect(() => {
    if (mapReady && bounds) fitRoute();
  }, [bounds, fitRoute, mapReady]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>{routeData?.Title || 'מפת מסלול'}</Text>
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
          <Text style={styles.emptyText}>יש להוסיף מפתח MapTiler מוגן ל־Web.</Text>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <View ref={containerRef} style={styles.webMap} testID="route-map" />
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
    </View>
  );
}
