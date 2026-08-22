import React, { useMemo } from 'react';
import { View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import AppText from '../../../components/AppText';
import { recommendationComposerStyles as styles } from '../../../styles';

function normalizeCoordinate(value) {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export default function ManualMapPinPicker({ destination, value, onChange }) {
  const center = useMemo(
    () => normalizeCoordinate(destination?.coordinates) || { latitude: 32.0853, longitude: 34.7818 },
    [destination?.coordinates]
  );
  const marker = normalizeCoordinate(value);

  return (
    <View>
      <MapView
        key={`${center.latitude}:${center.longitude}`}
        style={styles.manualMap}
        provider={PROVIDER_GOOGLE}
        initialRegion={{ ...center, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
        onPress={(event) => onChange?.(event.nativeEvent.coordinate)}
        testID="recommendation-manual-map"
      >
        {marker ? (
          <Marker
            coordinate={marker}
            draggable
            onDragEnd={(event) => onChange?.(event.nativeEvent.coordinate)}
          />
        ) : null}
      </MapView>
      <AppText style={styles.fieldHint}>
        לחיצה על המפה מסמנת את הנקודה. אפשר לגרור את הסימון כדי לדייק.
      </AppText>
    </View>
  );
}
