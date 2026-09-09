import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from './AppText';
import { colors, exactLocationPickerStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';
import { locationCopy } from '../utils/locationCopy';

const MAP_LOAD_TIMEOUT_MS = 10000;

function LocationMap({
  place,
  style,
  testID = 'exact-location-map-preview',
  locale = 'he',
  interactive = false,
}) {
  const [mapInstance, setMapInstance] = useState(0);
  const [loadStatus, setLoadStatus] = useState('loading');
  const coordinates = getPlaceCoordinates(place);
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  const validCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  const copy = locationCopy(locale);
  const mapRef = useRef(null);
  const currentRegion = useRef(null);

  useEffect(() => {
    if (!validCoordinates) return undefined;
    setLoadStatus('loading');
    currentRegion.current = null;
    return undefined;
  }, [lat, lng, mapInstance, validCoordinates]);

  useEffect(() => {
    if (!validCoordinates || loadStatus !== 'loading') return undefined;
    const timer = setTimeout(() => setLoadStatus('error'), MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [lat, lng, loadStatus, mapInstance, validCoordinates]);

  const markLoaded = useCallback(() => setLoadStatus('ready'), []);
  const retry = useCallback(() => {
    setLoadStatus('loading');
    setMapInstance((value) => value + 1);
  }, []);

  if (!validCoordinates) return null;
  const coordinate = { latitude: lat, longitude: lng };
  const region = { ...coordinate, latitudeDelta: 0.06, longitudeDelta: 0.06 };
  const moveTo = (nextRegion) => {
    currentRegion.current = nextRegion;
    mapRef.current?.animateToRegion(nextRegion, 250);
  };
  const zoom = (factor) => {
    const current = currentRegion.current || region;
    moveTo({ ...current,
      latitudeDelta: Math.max(0.001, Math.min(120, current.latitudeDelta * factor)),
      longitudeDelta: Math.max(0.001, Math.min(120, current.longitudeDelta * factor)),
    });
  };
  return (
    <View style={[interactive ? styles.mapExpandedFrame : styles.previewMap, style]}>
      <MapView
        ref={mapRef}
        key={`${lat}:${lng}:${mapInstance}`}
        style={StyleSheet.absoluteFill}
        {...(interactive ? { initialRegion: region } : { region })}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        liteMode={!interactive && Platform.OS === 'android'}
        cacheEnabled={!interactive && Platform.OS === 'ios'}
        loadingEnabled
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        zoomTapEnabled={interactive}
        showsScale
        showsPointsOfInterests
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        pointerEvents={interactive ? 'auto' : 'none'}
        onRegionChangeComplete={(nextRegion) => { currentRegion.current = nextRegion; }}
        onMapReady={Platform.OS === 'android' ? undefined : markLoaded}
        onMapLoaded={markLoaded}
        testID={testID}
      >
        <Marker coordinate={coordinate} title={place?.name || undefined} />
      </MapView>
      {loadStatus === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, styles.mapSkeleton]} testID={`${testID}-skeleton`}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {loadStatus === 'error' ? (
        <View style={[StyleSheet.absoluteFill, styles.mapFailure]} testID={`${testID}-error`}>
          <AppText style={styles.mapFailureText}>{copy.mapUnavailable}</AppText>
          <TouchableOpacity
            style={styles.mapFailureRetry}
            onPress={retry}
            accessibilityRole="button"
            testID={`${testID}-retry`}
          >
            <AppText style={styles.mapFailureRetryText}>{copy.retry}</AppText>
          </TouchableOpacity>
        </View>
      ) : null}
      {interactive && loadStatus === 'ready' ? (
        <View style={styles.mapControls}>
          {[
            ['zoom-in', '+', copy.mapZoomIn, () => zoom(0.5)],
            ['zoom-out', '−', copy.mapZoomOut, () => zoom(2)],
            ['recenter', copy.mapRecenter, copy.mapRecenter, () => moveTo(region)],
          ].map(([id, text, label, onPress]) => (
            <TouchableOpacity key={id} style={styles.mapControlButton} onPress={onPress}
              accessibilityRole="button" accessibilityLabel={label} testID={`${testID}-${id}`}>
              <AppText style={styles.mapFailureRetryText}>{text}</AppText>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function ExactLocationMapPreview({ place, style, testID = 'exact-location-map-preview', locale = 'he' }) {
  const [expanded, setExpanded] = useState(false);
  const copy = locationCopy(locale);
  const coordinates = getPlaceCoordinates(place);
  useEffect(() => { setExpanded(false); }, [coordinates?.lat, coordinates?.lng]);
  if (!coordinates) return null;
  return (
    <View>
      <LocationMap place={place} style={style} testID={testID} locale={locale} />
      <TouchableOpacity style={styles.mapOpenButton} onPress={() => setExpanded(true)}
        accessibilityRole="button" testID={`${testID}-expand`}>
        <AppText style={styles.mapFailureRetryText}>{copy.mapExpand}</AppText>
      </TouchableOpacity>
      {expanded ? (
        <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
          <SafeAreaView style={styles.mapExpandedScreen}>
            <View style={styles.mapExpandedHeader}>
              <TouchableOpacity style={styles.mapControlButton} onPress={() => setExpanded(false)}
                accessibilityRole="button" testID={`${testID}-close`}>
                <AppText style={styles.mapFailureRetryText}>{copy.mapClose}</AppText>
              </TouchableOpacity>
              <AppText style={styles.mapExpandedTitle} numberOfLines={2}>{place?.name || copy.mapPreview}</AppText>
            </View>
            <AppText style={styles.mapHelp}>{copy.mapInteract}</AppText>
            <LocationMap place={place} testID={`${testID}-expanded`} locale={locale} interactive />
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}
