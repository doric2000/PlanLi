import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { colors, exactLocationPickerStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';

export default function ExactLocationMapPreview({
  place,
  style,
  testID = 'exact-location-map-preview',
}) {
  const [mountMap, setMountMap] = useState(false);
  const [ready, setReady] = useState(false);
  const coordinates = getPlaceCoordinates(place);
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);

  useEffect(() => {
    setReady(false);
    const task = InteractionManager.runAfterInteractions(() => setMountMap(true));
    return () => task?.cancel?.();
  }, []);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const coordinate = { latitude: lat, longitude: lng };
  const region = { ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.012 };
  return (
    <View style={[styles.previewMap, style]}>
      {mountMap ? (
        <MapView
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
          onMapReady={() => setReady(true)}
          testID={testID}
        >
          <Marker coordinate={coordinate} title={place?.name || undefined} />
        </MapView>
      ) : null}
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, styles.mapSkeleton]} testID={`${testID}-skeleton`}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </View>
  );
}
