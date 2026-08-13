import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  USER_MAP_ZOOM,
} from '../../../config/mapConfig';
import { useLiveUserLocation } from '../../../hooks/useLiveUserLocation';
import { community } from '../../../styles';
import RecommendationMapPreviewCard from './RecommendationMapPreviewCard';
import { normalizeRecommendationMapItems } from '../utils/recommendationMap';

const TERMINAL_LOCATION_STATUSES = new Set(['denied', 'timeout', 'error']);
const MAX_NATIVE_MARKERS = 500;

function deltaForZoom(zoom) {
  return Math.max(0.002, 360 / (2 ** Number(zoom || DEFAULT_MAP_ZOOM)));
}

function regionForLocation(location, zoom = USER_MAP_ZOOM) {
  const delta = deltaForZoom(zoom);
  return {
    latitude: Number(location?.lat ?? DEFAULT_MAP_CENTER[1]),
    longitude: Number(location?.lng ?? DEFAULT_MAP_CENTER[0]),
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

function normalizeLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function viewportFromRegion(region) {
  if (!region) return null;
  const latitude = Number(region.latitude);
  const longitude = Number(region.longitude);
  const latitudeDelta = Math.abs(Number(region.latitudeDelta));
  const longitudeDelta = Math.abs(Number(region.longitudeDelta));
  if (![latitude, longitude, latitudeDelta, longitudeDelta].every(Number.isFinite)) return null;
  const zoom = Math.max(0, Math.min(20, Math.log2(360 / Math.max(longitudeDelta, 0.00001))));
  return {
    north: Math.min(90, latitude + latitudeDelta / 2),
    south: Math.max(-90, latitude - latitudeDelta / 2),
    east: normalizeLongitude(longitude + longitudeDelta / 2),
    west: normalizeLongitude(longitude - longitudeDelta / 2),
    zoom,
  };
}

const RecommendationMarker = memo(function RecommendationMarker({
  mapItem,
  selected,
  iconFontReady,
  onPress,
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 180);
    return () => clearTimeout(timer);
  }, [iconFontReady, mapItem.visual.color, mapItem.visual.icon, selected]);

  return (
    <Marker
      coordinate={{
        latitude: mapItem.coordinates.lat,
        longitude: mapItem.coordinates.lng,
      }}
      onPress={onPress}
      stopPropagation
      tracksViewChanges={tracksViewChanges}
      zIndex={selected ? 1000 : 1}
      title={mapItem.title}
      description={mapItem.visual.label}
      accessibilityLabel={`${mapItem.title}, ${mapItem.visual.label}`}
      testID={`recommendation-map-marker-${mapItem.id}`}
    >
      <View style={community.mapMarkerTouchTarget}>
        <View
          style={[
            community.mapMarkerBubble,
            { backgroundColor: mapItem.visual.color },
            selected && community.mapMarkerBubbleSelected,
          ]}
        >
          {iconFontReady && (
            <MaterialIcons
              name={mapItem.visual.icon}
              size={selected ? 23 : 19}
              color="#FFFFFF"
            />
          )}
        </View>
        <View
          style={[
            community.mapMarkerTail,
            { borderTopColor: mapItem.visual.color },
            selected && community.mapMarkerTailSelected,
          ]}
        />
      </View>
    </Marker>
  );
});

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
  const initialRegionRef = useRef(null);
  const currentRegionRef = useRef(null);
  const searchedRef = useRef(false);
  const userGestureRef = useRef(false);
  const [mapInstance, setMapInstance] = useState(0);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(null);
  const [iconFontReady, setIconFontReady] = useState(false);
  const [searchAreaVisible, setSearchAreaVisible] = useState(false);
  const {
    location,
    status,
    awaitingFirstFix,
    startTracking,
    stopTracking,
  } = useLiveUserLocation();

  if (!initialRegionRef.current && location) {
    initialRegionRef.current = regionForLocation(location, USER_MAP_ZOOM);
    currentRegionRef.current = initialRegionRef.current;
  } else if (!initialRegionRef.current && TERMINAL_LOCATION_STATUSES.has(status)) {
    initialRegionRef.current = regionForLocation(null, DEFAULT_MAP_ZOOM);
    currentRegionRef.current = initialRegionRef.current;
  }

  const mapItems = useMemo(
    () => normalizeRecommendationMapItems(recommendations).slice(0, MAX_NATIVE_MARKERS),
    [recommendations]
  );
  const selectedMapItem = useMemo(
    () => mapItems.find((entry) => entry.id === selectedRecommendationId) || null,
    [mapItems, selectedRecommendationId]
  );

  useEffect(() => {
    let active = true;
    MaterialIcons.loadFont()
      .catch(() => {})
      .finally(() => {
        if (active) setIconFontReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  useEffect(() => {
    if (selectedRecommendationId && !selectedMapItem) setSelectedRecommendationId(null);
  }, [selectedMapItem, selectedRecommendationId]);

  const searchRegion = useCallback((region) => {
    const viewport = viewportFromRegion(region);
    if (!viewport) return;
    searchedRef.current = true;
    setSearchAreaVisible(false);
    setSelectedRecommendationId(null);
    onSearchViewport?.(viewport);
  }, [onSearchViewport]);

  const handleMapReady = useCallback(() => {
    if (!searchedRef.current) searchRegion(currentRegionRef.current || initialRegionRef.current);
  }, [searchRegion]);

  const handleRegionChangeComplete = useCallback((region, details) => {
    currentRegionRef.current = region;
    const wasGesture = userGestureRef.current || details?.isGesture === true;
    userGestureRef.current = false;
    if (wasGesture && searchedRef.current) setSearchAreaVisible(true);
  }, []);

  const centerOnUser = useCallback(() => {
    if (!location) {
      startTracking();
      return;
    }
    const nextRegion = regionForLocation(location, USER_MAP_ZOOM);
    initialRegionRef.current = nextRegion;
    currentRegionRef.current = nextRegion;
    searchedRef.current = false;
    setSearchAreaVisible(false);
    setSelectedRecommendationId(null);
    setMapInstance((value) => value + 1);
  }, [location, startTracking]);

  if (!initialRegionRef.current && awaitingFirstFix) {
    return (
      <View style={community.inlineMapEmpty} testID="map-awaiting-location">
        <ActivityIndicator size="large" color="#1E3A5F" />
        <AppText style={community.inlineMapEmptyTitle}>מאתר את המיקום שלך</AppText>
        <AppText style={community.inlineMapEmptyText}>המפה תיפתח ישירות באזור הקרוב אליך.</AppText>
      </View>
    );
  }

  if (!initialRegionRef.current) {
    initialRegionRef.current = regionForLocation(null, DEFAULT_MAP_ZOOM);
    currentRegionRef.current = initialRegionRef.current;
  }

  return (
    <View style={community.inlineMapWrap}>
      <MapView
        key={`community-map-${mapInstance}`}
        testID="community-inline-map"
        style={community.inlineMapView}
        initialRegion={initialRegionRef.current}
        provider={PROVIDER_GOOGLE}
        mapType="standard"
        showsUserLocation
        showsMyLocationButton={false}
        onMapReady={handleMapReady}
        onPanDrag={() => { userGestureRef.current = true; }}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={() => setSelectedRecommendationId(null)}
        mapPadding={{
          top: 8,
          right: 8,
          bottom: selectedMapItem ? overlayBottomInset + 180 : overlayBottomInset,
          left: 8,
        }}
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

        {mapItems.map((mapItem) => (
          <RecommendationMarker
            key={mapItem.id}
            mapItem={mapItem}
            selected={mapItem.id === selectedRecommendationId}
            iconFontReady={iconFontReady}
            onPress={() => setSelectedRecommendationId(mapItem.id)}
          />
        ))}
      </MapView>

      <View
        style={[
          community.mapControls,
          selectedMapItem
            ? community.mapControlsSelected
            : { bottom: overlayBottomInset + 12 },
        ]}
        pointerEvents="box-none"
        testID="community-map-controls"
      >
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
          onPress={() => searchRegion(currentRegionRef.current)}
          accessibilityRole="button"
          testID="map-search-this-area"
        >
          <Ionicons name="search" size={17} color="#FFFFFF" />
          <AppText style={community.mapSearchAreaText}>חיפוש באזור זה</AppText>
        </TouchableOpacity>
      )}

      {TERMINAL_LOCATION_STATUSES.has(status) && (
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
        <TouchableOpacity style={community.mapErrorPill} onPress={() => searchRegion(currentRegionRef.current)}>
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
