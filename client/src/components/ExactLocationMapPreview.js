import React from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { exactLocationPickerStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';

export default function ExactLocationMapPreview({ place }) {
  const coordinates = getPlaceCoordinates(place);
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const coordinate = { latitude: lat, longitude: lng };
  return (
    <MapView
      key={`${lat}:${lng}`}
      style={styles.previewMap}
      initialRegion={{ ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
      provider={PROVIDER_GOOGLE}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      pointerEvents="none"
      testID="exact-location-map-preview"
    >
      <Marker coordinate={coordinate} title={place?.name || undefined} />
    </MapView>
  );
}
