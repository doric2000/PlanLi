import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';
import AppText from "../../../components/AppText";
import MapView, { Circle, Marker, Polyline, UrlTile } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import CachedImage from '../../../components/CachedImage';
import { USER_MAP_ZOOM } from '../../../config/mapConfig';
import { useLiveUserLocation } from '../../../hooks/useLiveUserLocation';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPlaceUrl,
  flattenValidRouteStops,
} from '../utils/routeStops';
import { colors, routeMapStyles as styles } from '../../../styles';

const LOCATION_RETRY_STATUSES = new Set(['denied', 'timeout', 'error']);

function deltaForZoom(zoom) {
  return Math.max(0.002, 360 / (2 ** Number(zoom || USER_MAP_ZOOM)));
}

export function getInitialRegion(stops) {
  if (!stops.length) {
    return {
      latitude: 31.0461,
      longitude: 34.8516,
      latitudeDelta: 6,
      longitudeDelta: 6,
    };
  }

  let minLat = stops[0].coordinates.lat;
  let maxLat = stops[0].coordinates.lat;
  let minLng = stops[0].coordinates.lng;
  let maxLng = stops[0].coordinates.lng;

  stops.forEach((stop) => {
    minLat = Math.min(minLat, stop.coordinates.lat);
    maxLat = Math.max(maxLat, stop.coordinates.lat);
    minLng = Math.min(minLng, stop.coordinates.lng);
    maxLng = Math.max(maxLng, stop.coordinates.lng);
  });

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.04, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.04, (maxLng - minLng) * 1.5),
  };
}

export default function RouteMapScreen({ route, navigation }) {
  const { routeData } = route.params || {};
  const stops = useMemo(() => flattenValidRouteStops(routeData), [routeData]);
  const routeRegion = useMemo(() => getInitialRegion(stops), [stops]);
  const coordinates = useMemo(
    () => stops.map((stop) => ({ latitude: stop.coordinates.lat, longitude: stop.coordinates.lng })),
    [stops]
  );
  const [selectedStop, setSelectedStop] = useState(null);
  const [mapInstance, setMapInstance] = useState(0);
  const initialRegionRef = useRef(routeRegion);
  const { location, status, startTracking, stopTracking } = useLiveUserLocation();
  const routeUrl = buildGoogleMapsDirectionsUrl(stops);

  useEffect(() => {
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  useEffect(() => {
    initialRegionRef.current = routeRegion;
    setMapInstance((value) => value + 1);
  }, [routeRegion]);

  const openUrl = useCallback((url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  }, []);

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

  const fitRoute = useCallback(() => {
    remountAtRegion(routeRegion);
  }, [remountAtRegion, routeRegion]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            {routeData?.Title || 'מפת מסלול'}
          </AppText>
          <AppText style={styles.headerSubtitle}>{stops.length} תחנות עם מיקום</AppText>
        </View>
        <TouchableOpacity
          onPress={() => openUrl(routeUrl)}
          disabled={stops.length < 2}
          style={[styles.headerActionButton, stops.length < 2 && styles.headerActionButtonDisabled]}
        >
          <AppText style={[styles.headerActionText, stops.length < 2 && styles.headerActionTextDisabled]}>
            פתח הכל
          </AppText>
        </TouchableOpacity>
      </View>

      {stops.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="map-outline" size={54} color={colors.textMuted} />
          <AppText style={styles.emptyTitle}>אין תחנות להצגה במפה</AppText>
          <AppText style={styles.emptyText}>הוסיפו תחנות עם מיקום מדויק בתוך ימי המסלול.</AppText>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapView
            key={`route-map-${mapInstance}`}
            style={styles.map}
            initialRegion={initialRegionRef.current}
            mapType="none"
            showsUserLocation
            showsMyLocationButton={false}
            onPress={() => setSelectedStop(null)}
            testID="route-map"
          >
            <UrlTile
              urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              tileSize={256}
              maximumZ={19}
              zIndex={0}
            />

            {!!location?.accuracy && (
              <Circle
                center={{ latitude: location.lat, longitude: location.lng }}
                radius={Math.max(1, Number(location.accuracy))}
                fillColor="rgba(47,128,237,0.12)"
                strokeColor="rgba(47,128,237,0.32)"
                strokeWidth={1}
              />
            )}

            {coordinates.length > 1 && (
              <Polyline coordinates={coordinates} strokeColor={colors.primary} strokeWidth={4} />
            )}

            {stops.map((stop) => (
              <Marker
                key={stop.id || `${stop.dayIndex}:${stop.stopIndex}`}
                coordinate={{
                  latitude: stop.coordinates.lat,
                  longitude: stop.coordinates.lng,
                }}
                onPress={() => setSelectedStop(stop)}
                stopPropagation
              >
                <View style={styles.markerWrap}>
                  <View style={styles.marker}>
                    {stop.image || stop.media ? (
                      <>
                        <CachedImage
                          source={{ uri: getMediaVariantUrl(stop.media, 'thumb', stop.image) }}
                          style={styles.markerImage}
                          contentFit="cover"
                          priority="low"
                        />
                        <View style={styles.markerNumberBadge}>
                          <AppText style={styles.markerNumberText}>{stop.globalIndex + 1}</AppText>
                        </View>
                      </>
                    ) : (
                      <AppText style={styles.markerText}>{stop.globalIndex + 1}</AppText>
                    )}
                  </View>
                </View>
              </Marker>
            ))}
          </MapView>

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
              testID="route-map-fit-route"
            >
              <Ionicons name="expand-outline" size={21} color={colors.primary} />
            </TouchableOpacity>
          </View>

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
            <TouchableOpacity onPress={() => setSelectedStop(null)} style={styles.sheetCloseButton}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.sheetTitleWrap}>
              <AppText style={styles.sheetKicker}>
                יום {selectedStop.dayIndex + 1} · תחנה {selectedStop.stopIndex + 1}
              </AppText>
              <AppText style={styles.sheetTitle} numberOfLines={2}>{selectedStop.title}</AppText>
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
                <AppText style={styles.sheetImageFallbackText}>{selectedStop.globalIndex + 1}</AppText>
              </View>
            )}
          </View>
          <AppText style={styles.sheetAddress} numberOfLines={2}>
            {selectedStop.place?.address || selectedStop.location || selectedStop.place?.name}
          </AppText>
          {!!selectedStop.description && (
            <AppText style={styles.sheetDescription} numberOfLines={3}>{selectedStop.description}</AppText>
          )}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => openUrl(buildGoogleMapsPlaceUrl(selectedStop))}
          >
            <Ionicons name="map-outline" size={18} color={colors.white} />
            <AppText style={styles.primaryButtonText}>פתח בגוגל מפות</AppText>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
