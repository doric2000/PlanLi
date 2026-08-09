import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons } from '@expo/vector-icons';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapTilerKey,
  getMapTilerStyleUrl,
  USER_MAP_ZOOM,
} from '../../../config/mapConfig';
import { useLiveUserLocation } from '../../../hooks/useLiveUserLocation';
import { userLocationGeoJson } from '../../../utils/mapGeoJson';
import { community } from '../../../styles';
import RecommendationMapPreviewCard from './RecommendationMapPreviewCard';
import { normalizeRecommendationMapItems, recommendationsToGeoJson } from '../utils/recommendationMap';

const WEB_KEY = getMapTilerKey('web');
const MAP_STYLE = getMapTilerStyleUrl(WEB_KEY);

function normalizedLongitude(value) {
  return ((Number(value) + 180) % 360 + 360) % 360 - 180;
}

function currentViewport(map) {
  if (!map) return null;
  const bounds = map.getBounds();
  const north = Number(bounds.getNorth());
  const south = Number(bounds.getSouth());
  const west = normalizedLongitude(bounds.getWest());
  const east = normalizedLongitude(bounds.getEast());
  const zoom = Number(map.getZoom());
  if (![north, south, west, east, zoom].every(Number.isFinite)) return null;
  return { north, south, west, east, zoom };
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
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const searchedRef = useRef(false);
  const autoSearchRef = useRef(false);
  const centeredOnUserRef = useRef(false);
  const lastViewportRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(null);
  const [searchAreaVisible, setSearchAreaVisible] = useState(false);
  const { location, status, startTracking, stopTracking } = useLiveUserLocation();
  const statusRef = useRef(status);
  const recommendationDataRef = useRef(null);
  const userDataRef = useRef(null);

  const mapItems = useMemo(
    () => normalizeRecommendationMapItems(recommendations),
    [recommendations]
  );
  const recommendationData = useMemo(
    () => recommendationsToGeoJson(recommendations),
    [recommendations]
  );
  const userData = useMemo(() => userLocationGeoJson(location), [location]);
  statusRef.current = status;
  recommendationDataRef.current = recommendationData;
  userDataRef.current = userData;
  const selectedMapItem = useMemo(
    () => mapItems.find((entry) => entry.id === selectedRecommendationId) || null,
    [mapItems, selectedRecommendationId]
  );

  const searchViewport = useCallback((viewport) => {
    if (!viewport) return;
    searchedRef.current = true;
    lastViewportRef.current = viewport;
    setSearchAreaVisible(false);
    setSelectedRecommendationId(null);
    onSearchViewport?.(viewport);
  }, [onSearchViewport]);

  const searchCurrentViewport = useCallback(() => {
    searchViewport(currentViewport(mapRef.current) || lastViewportRef.current);
  }, [searchViewport]);

  const centerOnUser = useCallback(() => {
    if (!location) {
      startTracking();
      return;
    }
    autoSearchRef.current = true;
    setSearchAreaVisible(false);
    mapRef.current?.flyTo({ center: [location.lng, location.lat], zoom: USER_MAP_ZOOM, duration: 700 });
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
      map.addSource('planli-user-location', { type: 'geojson', data: userDataRef.current });
      map.addLayer({
        id: 'planli-user-accuracy',
        type: 'fill',
        source: 'planli-user-location',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2F80ED', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'planli-user-ring',
        type: 'circle',
        source: 'planli-user-location',
        filter: ['==', ['get', 'kind'], 'user'],
        paint: { 'circle-radius': 10, 'circle-color': '#FFFFFF' },
      });
      map.addLayer({
        id: 'planli-user-dot',
        type: 'circle',
        source: 'planli-user-location',
        filter: ['==', ['get', 'kind'], 'user'],
        paint: { 'circle-radius': 6.5, 'circle-color': '#2F80ED' },
      });
      map.addSource('planli-recommendations', {
        type: 'geojson',
        data: recommendationDataRef.current,
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: 15,
      });
      map.addLayer({
        id: 'planli-recommendation-clusters',
        type: 'circle',
        source: 'planli-recommendations',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1E3A5F',
          'circle-radius': ['step', ['get', 'point_count'], 19, 20, 23, 80, 28],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'planli-recommendation-cluster-count',
        type: 'symbol',
        source: 'planli-recommendations',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#FFFFFF' },
      });
      map.addLayer({
        id: 'planli-recommendation-pins',
        type: 'circle',
        source: 'planli-recommendations',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#1E3A5F'],
          'circle-radius': 9,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'planli-recommendation-selected',
        type: 'circle',
        source: 'planli-recommendations',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: {
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': 15,
          'circle-stroke-color': '#1E3A5F',
          'circle-stroke-width': 3,
        },
      });

      map.on('click', 'planli-recommendation-clusters', async (event) => {
        const feature = event.features?.[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        if (!feature || !Number.isFinite(clusterId)) return;
        try {
          const zoom = await map.getSource('planli-recommendations').getClusterExpansionZoom(clusterId);
          map.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(20, zoom), duration: 350 });
        } catch {
          // The cluster may disappear if data refreshes during the click.
        }
      });
      map.on('click', 'planli-recommendation-pins', (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (id) setSelectedRecommendationId(String(id));
      });
      map.on('click', (event) => {
        const hit = map.queryRenderedFeatures(event.point, {
          layers: ['planli-recommendation-pins', 'planli-recommendation-clusters'],
        });
        if (!hit.length) setSelectedRecommendationId(null);
      });
      setMapReady(true);
    };
    const onMoveEnd = (event) => {
      const viewport = currentViewport(map);
      if (!viewport) return;
      lastViewportRef.current = viewport;
      if (autoSearchRef.current) {
        autoSearchRef.current = false;
        searchViewport(viewport);
      } else if (!searchedRef.current && !['idle', 'requesting'].includes(statusRef.current)) {
        searchViewport(viewport);
      } else if (searchedRef.current && event?.originalEvent) {
        setSearchAreaVisible(true);
      }
    };
    map.on('load', onLoad);
    map.on('moveend', onMoveEnd);

    return () => {
      map.off('load', onLoad);
      map.off('moveend', onMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [searchViewport]);

  useEffect(() => {
    const source = mapRef.current?.getSource?.('planli-recommendations');
    source?.setData?.(recommendationData);
  }, [recommendationData]);

  useEffect(() => {
    const source = mapRef.current?.getSource?.('planli-user-location');
    source?.setData?.(userData);
  }, [userData]);

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
    if (!mapReady) return;
    mapRef.current?.setFilter('planli-recommendation-selected', selectedRecommendationId
      ? ['==', ['get', 'id'], selectedRecommendationId]
      : ['==', ['get', 'id'], '__none__']);
  }, [mapReady, selectedRecommendationId]);

  useEffect(() => {
    if (!selectedRecommendationId || selectedMapItem) return;
    setSelectedRecommendationId(null);
  }, [selectedMapItem, selectedRecommendationId]);

  if (!MAP_STYLE) {
    return (
      <View style={community.inlineMapEmpty} testID="map-missing-key">
        <Ionicons name="map-outline" size={40} color="#6B7280" />
        <AppText style={community.inlineMapEmptyTitle}>המפה עדיין לא הוגדרה</AppText>
        <AppText style={community.inlineMapEmptyText}>
          מפת הרקע אינה מוגדרת בסביבה הזו. שאר האפליקציה זמינה כרגיל.
        </AppText>
      </View>
    );
  }

  return (
    <View style={community.inlineMapWrap}>
      <View ref={containerRef} style={community.inlineMapView} testID="community-inline-map" />

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
          <AppText style={community.mapSearchAreaText}>חיפוש באזור זה</AppText>
        </TouchableOpacity>
      )}

      {status === 'denied' && (
        <TouchableOpacity style={community.mapLocationNotice} onPress={startTracking}>
          <Ionicons name="location-outline" size={17} color="#1E3A5F" />
          <AppText style={community.mapLocationNoticeText}>אפשר להפעיל מיקום כדי למצוא המלצות קרובות</AppText>
        </TouchableOpacity>
      )}

      {(truncated || zoomInRequired) && (
        <View style={community.mapZoomNotice} pointerEvents="none">
          <AppText style={community.mapZoomNoticeText}>יש כאן הרבה המלצות — התקרבו כדי לראות את כולן</AppText>
        </View>
      )}

      {loading && (
        <View style={community.mapLoadingPill} pointerEvents="none">
          <ActivityIndicator size="small" color="#1E3A5F" />
          <AppText style={community.mapLoadingText}>טוען המלצות באזור…</AppText>
        </View>
      )}

      {!!error && !loading && (
        <TouchableOpacity style={community.mapErrorPill} onPress={searchCurrentViewport}>
          <Ionicons name="refresh" size={17} color="#991B1B" />
          <AppText style={community.mapErrorText}>לא הצלחנו לטעון. לחצו לניסיון נוסף</AppText>
        </TouchableOpacity>
      )}

      {!loading && !error && searchedRef.current && mapItems.length === 0 && !zoomInRequired && (
        <View style={community.mapEmptyPill} pointerEvents="none">
          <AppText style={community.mapEmptyPillText}>אין המלצות באזור המוצג</AppText>
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
