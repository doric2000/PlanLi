import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  TransformRequestManager,
} from '@maplibre/maplibre-react-native';

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapTilerKey,
  getMapTilerStyleUrl,
  USER_MAP_ZOOM,
} from '../../../config/mapConfig';
import { useLiveUserLocation } from '../../../hooks/useLiveUserLocation';
import { featureCollection, userLocationGeoJson, viewportFromBounds } from '../../../utils/mapGeoJson';
import { community } from '../../../styles';
import RecommendationMapPreviewCard from './RecommendationMapPreviewCard';
import { normalizeRecommendationMapItems, recommendationsToGeoJson } from '../utils/recommendationMap';

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

function viewStateFromEvent(event) {
  return event?.nativeEvent || event || null;
}

export default function CommunityInlineMap({
  recommendations,
  loading = false,
  error = null,
  truncated = false,
  zoomInRequired = false,
  onSearchViewport,
  onOpenRecommendation,
  overlayBottomInset = 16,
}) {
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const sourceRef = useRef(null);
  const lastViewportRef = useRef(null);
  const searchedRef = useRef(false);
  const autoSearchRef = useRef(false);
  const centeredOnUserRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(null);
  const [searchAreaVisible, setSearchAreaVisible] = useState(false);
  const { location, status, startTracking, stopTracking } = useLiveUserLocation();

  const mapItems = useMemo(
    () => normalizeRecommendationMapItems(recommendations),
    [recommendations]
  );
  const recommendationsGeoJson = useMemo(
    () => recommendationsToGeoJson(recommendations),
    [recommendations]
  );
  const userGeoJson = useMemo(() => userLocationGeoJson(location), [location]);
  const selectedMapItem = useMemo(
    () => mapItems.find((entry) => entry.id === selectedRecommendationId) || null,
    [mapItems, selectedRecommendationId]
  );

  const searchViewport = useCallback((viewport) => {
    if (!viewport) return;
    lastViewportRef.current = viewport;
    searchedRef.current = true;
    setSearchAreaVisible(false);
    setSelectedRecommendationId(null);
    onSearchViewport?.(viewport);
  }, [onSearchViewport]);

  const searchCurrentViewport = useCallback(async () => {
    try {
      const state = await mapRef.current?.getViewState?.();
      const viewport = viewportFromBounds(state?.bounds, state?.zoom);
      searchViewport(viewport || lastViewportRef.current);
    } catch {
      searchViewport(lastViewportRef.current);
    }
  }, [searchViewport]);

  const centerOnUser = useCallback(() => {
    if (!location) {
      startTracking();
      return;
    }
    autoSearchRef.current = true;
    setSearchAreaVisible(false);
    cameraRef.current?.flyTo?.({
      center: [location.lng, location.lat],
      zoom: USER_MAP_ZOOM,
      duration: 700,
    });
  }, [location, startTracking]);

  useEffect(() => {
    if (!MAP_STYLE) return undefined;
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  useEffect(() => {
    if (!mapReady || !location || centeredOnUserRef.current) return;
    centeredOnUserRef.current = true;
    centerOnUser();
  }, [centerOnUser, location, mapReady]);

  useEffect(() => {
    if (!mapReady || searchedRef.current || !['denied', 'error'].includes(status)) return;
    searchCurrentViewport();
  }, [mapReady, searchCurrentViewport, status]);

  useEffect(() => {
    if (!selectedRecommendationId || selectedMapItem) return;
    setSelectedRecommendationId(null);
  }, [selectedMapItem, selectedRecommendationId]);

  const handleRegionDidChange = useCallback((event) => {
    const state = viewStateFromEvent(event);
    const viewport = viewportFromBounds(state?.bounds, state?.zoom);
    if (!viewport) return;
    lastViewportRef.current = viewport;
    if (autoSearchRef.current) {
      autoSearchRef.current = false;
      searchViewport(viewport);
      return;
    }
    if (!searchedRef.current && !['idle', 'requesting'].includes(status)) {
      searchViewport(viewport);
      return;
    }
    if (state?.userInteraction && searchedRef.current) setSearchAreaVisible(true);
  }, [searchViewport, status]);

  const handleSourcePress = useCallback(async (event) => {
    event?.stopPropagation?.();
    const feature = event?.nativeEvent?.features?.[0] || event?.features?.[0];
    if (!feature) return;
    const properties = feature.properties || {};
    const clusterId = Number(properties.cluster_id);
    if (properties.cluster && Number.isFinite(clusterId)) {
      try {
        const zoom = await sourceRef.current?.getClusterExpansionZoom?.(clusterId);
        const center = feature.geometry?.coordinates;
        if (Array.isArray(center) && Number.isFinite(zoom)) {
          cameraRef.current?.easeTo?.({ center, zoom: Math.min(20, zoom), duration: 350 });
        }
      } catch {
        // Keep the current viewport if a cluster disappears during the gesture.
      }
      return;
    }
    const id = properties.id || properties.postId;
    if (id) setSelectedRecommendationId(String(id));
  }, []);

  if (!MAP_STYLE) {
    return (
      <View style={community.inlineMapEmpty} testID="map-missing-key">
        <Ionicons name="map-outline" size={40} color="#6B7280" />
        <Text style={community.inlineMapEmptyTitle}>המפה עדיין לא הוגדרה</Text>
        <Text style={community.inlineMapEmptyText}>
          יש להוסיף מפתח MapTiler מוגן לבניית המובייל. שאר האפליקציה זמינה כרגיל.
        </Text>
      </View>
    );
  }

  return (
    <View style={community.inlineMapWrap}>
      <Map
        ref={mapRef}
        testID="community-inline-map"
        style={community.inlineMapView}
        mapStyle={MAP_STYLE}
        attribution
        attributionPosition={{ top: 8, left: 8 }}
        logo={false}
        compass
        compassPosition={{ top: 8, right: 8 }}
        touchPitch={false}
        onDidFinishLoadingMap={() => setMapReady(true)}
        onRegionDidChange={handleRegionDidChange}
        onPress={() => setSelectedRecommendationId(null)}
      >
        <Camera
          ref={cameraRef}
          minZoom={2}
          maxZoom={20}
          initialViewState={{ center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM }}
        />

        <GeoJSONSource
          id="planli-user-location"
          data={userGeoJson}
        >
          <Layer
            id="planli-user-accuracy"
            type="fill"
            filter={['==', ['geometry-type'], 'Polygon']}
            paint={{ 'fill-color': '#2F80ED', 'fill-opacity': 0.12 }}
          />
          <Layer
            id="planli-user-ring"
            type="circle"
            filter={['==', ['get', 'kind'], 'user']}
            paint={{ 'circle-radius': 10, 'circle-color': '#FFFFFF', 'circle-opacity': 0.98 }}
          />
          <Layer
            id="planli-user-dot"
            type="circle"
            filter={['==', ['get', 'kind'], 'user']}
            paint={{ 'circle-radius': 6.5, 'circle-color': '#2F80ED' }}
          />
        </GeoJSONSource>

        <GeoJSONSource
          ref={sourceRef}
          id="planli-recommendations"
          data={recommendationsGeoJson || featureCollection([])}
          cluster
          clusterRadius={52}
          clusterMaxZoom={15}
          onPress={handleSourcePress}
          hitbox={{ top: 18, right: 18, bottom: 18, left: 18 }}
        >
          <Layer
            id="planli-recommendation-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': '#1E3A5F',
              'circle-radius': ['step', ['get', 'point_count'], 19, 20, 23, 80, 28],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
            }}
          />
          <Layer
            id="planli-recommendation-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#FFFFFF' }}
          />
          <Layer
            id="planli-recommendation-pins"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': ['coalesce', ['get', 'color'], '#1E3A5F'],
              'circle-radius': 9,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
            }}
          />
          <Layer
            id="planli-recommendation-selected"
            type="circle"
            filter={selectedRecommendationId
              ? ['==', ['get', 'id'], selectedRecommendationId]
              : ['==', ['get', 'id'], '__none__']}
            paint={{
              'circle-color': 'rgba(0,0,0,0)',
              'circle-radius': 15,
              'circle-stroke-color': '#1E3A5F',
              'circle-stroke-width': 3,
            }}
          />
        </GeoJSONSource>
      </Map>

      <View style={[
        community.mapControls,
        { bottom: overlayBottomInset + (selectedMapItem ? 174 : 12) },
      ]} pointerEvents="box-none">
        <TouchableOpacity
          style={community.mapControlButton}
          onPress={centerOnUser}
          accessibilityRole="button"
          accessibilityLabel="המיקום שלי"
          testID="map-my-location"
        >
          <Ionicons name="locate" size={22} color="#1E3A5F" />
        </TouchableOpacity>
      </View>

      {searchAreaVisible && (
        <TouchableOpacity
          style={community.mapSearchAreaButton}
          onPress={() => searchViewport(lastViewportRef.current)}
          accessibilityRole="button"
          testID="map-search-this-area"
        >
          <Ionicons name="search" size={17} color="#FFFFFF" />
          <Text style={community.mapSearchAreaText}>חיפוש באזור זה</Text>
        </TouchableOpacity>
      )}

      {status === 'denied' && (
        <TouchableOpacity style={community.mapLocationNotice} onPress={startTracking}>
          <Ionicons name="location-outline" size={17} color="#1E3A5F" />
          <Text style={community.mapLocationNoticeText}>אפשר להפעיל מיקום כדי למצוא המלצות קרובות</Text>
        </TouchableOpacity>
      )}

      {(truncated || zoomInRequired) && (
        <View style={community.mapZoomNotice} pointerEvents="none">
          <Text style={community.mapZoomNoticeText}>יש כאן הרבה המלצות — התקרבו כדי לראות את כולן</Text>
        </View>
      )}

      {loading && (
        <View style={community.mapLoadingPill} pointerEvents="none">
          <ActivityIndicator size="small" color="#1E3A5F" />
          <Text style={community.mapLoadingText}>טוען המלצות באזור…</Text>
        </View>
      )}

      {!!error && !loading && (
        <TouchableOpacity style={community.mapErrorPill} onPress={searchCurrentViewport}>
          <Ionicons name="refresh" size={17} color="#991B1B" />
          <Text style={community.mapErrorText}>לא הצלחנו לטעון. לחצו לניסיון נוסף</Text>
        </TouchableOpacity>
      )}

      {!loading && !error && searchedRef.current && mapItems.length === 0 && !zoomInRequired && (
        <View style={community.mapEmptyPill} pointerEvents="none">
          <Text style={community.mapEmptyPillText}>אין המלצות באזור המוצג</Text>
        </View>
      )}

      {!!selectedMapItem && (
        <RecommendationMapPreviewCard
          item={selectedMapItem.recommendation}
          bottomInset={overlayBottomInset}
          onClose={() => setSelectedRecommendationId(null)}
          onOpenRecommendation={onOpenRecommendation}
        />
      )}
    </View>
  );
}
