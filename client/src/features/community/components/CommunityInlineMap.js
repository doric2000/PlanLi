import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import MapView, { Marker, UrlTile } from 'react-native-maps';

import { community } from '../../../styles';
import { useUserLocation } from '../../../hooks/useUserLocation';
import RecommendationMapPreviewCard from './RecommendationMapPreviewCard';
import { normalizeRecommendationMapItems } from '../utils/recommendationMap';

const MAX_MARKERS_RENDER = 200;

const RecommendationMarker = memo(function RecommendationMarker({
  mapItem,
  selected,
  iconFontReady,
  onPress,
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    if (!iconFontReady) {
      setTracksViewChanges(true);
      return undefined;
    }

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
  focusOnPins = false,
  onOpenRecommendation,
  overlayBottomInset = 16,
}) {
  const mapItems = useMemo(
    () => normalizeRecommendationMapItems(recommendations).slice(0, MAX_MARKERS_RENDER),
    [recommendations]
  );
  const mapRef = useRef(null);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(null);
  const [iconFontReady, setIconFontReady] = useState(false);
  const { location: userLocation, requestLocation } = useUserLocation();

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
    if (Platform.OS === 'web') return;
    requestLocation?.();
  }, [requestLocation]);

  useEffect(() => {
    if (!selectedRecommendationId) return;
    if (selectedMapItem) return;
    setSelectedRecommendationId(null);
  }, [selectedMapItem, selectedRecommendationId]);

  const coordinates = useMemo(
    () => mapItems.map((entry) => ({
      latitude: entry.coordinates.lat,
      longitude: entry.coordinates.lng,
    })),
    [mapItems]
  );

  const boundsRegion = useMemo(() => {
    if (!coordinates.length) return null;
    let minLat = coordinates[0].latitude;
    let maxLat = coordinates[0].latitude;
    let minLng = coordinates[0].longitude;
    let maxLng = coordinates[0].longitude;
    for (let i = 1; i < coordinates.length; i += 1) {
      const { latitude, longitude } = coordinates[i];
      if (latitude < minLat) minLat = latitude;
      if (latitude > maxLat) maxLat = latitude;
      if (longitude < minLng) minLng = longitude;
      if (longitude > maxLng) maxLng = longitude;
    }
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.4),
    };
  }, [coordinates]);

  // Imperative region changes have caused react-native-maps crashes on some devices,
  // so region changes remain remount-driven.
  const mapKey = useMemo(() => {
    if (focusOnPins) {
      return `pins:${mapItems.length}:${mapItems[0]?.id || ''}:${mapItems[mapItems.length - 1]?.id || ''}`;
    }
    if (userLocation) {
      return `user:${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}`;
    }
    return 'default';
  }, [focusOnPins, mapItems, userLocation]);

  const initialRegion = useMemo(() => {
    if (focusOnPins && boundsRegion) return boundsRegion;
    if (userLocation) {
      return {
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        ...community.cityWideMapDelta,
      };
    }
    if (boundsRegion) return boundsRegion;
    return community.defaultMapRegion;
  }, [boundsRegion, focusOnPins, userLocation]);

  if (Platform.OS === 'web') return null;

  return (
    <View style={community.inlineMapWrap}>
      {mapItems.length === 0 ? (
        <View style={community.inlineMapEmpty}>
          <MaterialIcons name="location-off" size={36} color="#9CA3AF" />
          <Text style={community.inlineMapEmptyText}>
            אין כרגע המלצות עם מיקום במסננים שבחרת.
          </Text>
        </View>
      ) : (
        <View style={community.inlineMapContainer}>
          <MapView
            key={mapKey}
            ref={mapRef}
            testID="community-inline-map"
            style={community.inlineMapView}
            initialRegion={initialRegion}
            mapType={Platform.OS === 'android' ? 'none' : 'standard'}
            onPress={() => setSelectedRecommendationId(null)}
            mapPadding={{
              top: 8,
              right: 8,
              bottom: selectedMapItem ? overlayBottomInset + 180 : overlayBottomInset,
              left: 8,
            }}
          >
            <UrlTile
              urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              tileSize={256}
              maximumZ={19}
              zIndex={0}
            />

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

          <View style={community.mapAttributionTopWrap} pointerEvents="none">
            <Text style={community.mapAttributionText}>© OpenStreetMap contributors</Text>
          </View>
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
