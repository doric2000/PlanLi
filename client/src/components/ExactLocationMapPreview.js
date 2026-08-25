import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import AppText from './AppText';
import { colors, exactLocationPickerStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';
import { locationCopy } from '../utils/locationCopy';

const MAP_LOAD_TIMEOUT_MS = 10000;

export default function ExactLocationMapPreview({
  place,
  style,
  testID = 'exact-location-map-preview',
  locale = 'he',
}) {
  const [mapInstance, setMapInstance] = useState(0);
  const [loadStatus, setLoadStatus] = useState('loading');
  const coordinates = getPlaceCoordinates(place);
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  const validCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  const copy = locationCopy(locale);

  useEffect(() => {
    if (!validCoordinates) return undefined;
    setLoadStatus('loading');
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
  const region = { ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.012 };
  return (
    <View style={[styles.previewMap, style]}>
      <MapView
        key={`${lat}:${lng}:${mapInstance}`}
        style={StyleSheet.absoluteFill}
        region={region}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        liteMode={Platform.OS === 'android'}
        cacheEnabled={Platform.OS === 'ios'}
        loadingEnabled
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        pointerEvents="none"
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
    </View>
  );
}
