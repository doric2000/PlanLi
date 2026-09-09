import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from './AppText';

import { exactLocationPickerStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';
import { locationCopy } from '../utils/locationCopy';

export default function ExactLocationMapPreview({
  place,
  title = 'תצוגה מקדימה של המיקום',
  style,
  testID = 'exact-location-map-preview',
  locale = 'he',
}) {
  const [expanded, setExpanded] = useState(false);
  const copy = locationCopy(locale);
  const coordinates = getPlaceCoordinates(place);
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  useEffect(() => { setExpanded(false); }, [lat, lng]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const embedKey = String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY || '').trim();
  const query = place?.placeId ? `place_id:${place.placeId}` : `${lat},${lng}`;
  const src = embedKey
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(query)}&zoom=13`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=13&output=embed`;
  const frame = (interactive) => React.createElement('iframe', {
    title: place?.name || title,
    src,
    style: StyleSheet.flatten(interactive
      ? { width: '100%', height: '100%', flex: 1, borderWidth: 0 }
      : [styles.previewMap, style, { pointerEvents: 'none' }]),
    loading: 'lazy',
    referrerPolicy: 'no-referrer-when-downgrade',
    'data-testid': interactive ? `${testID}-expanded` : testID,
    tabIndex: interactive ? 0 : -1,
    allowFullScreen: interactive,
  });
  return (
    <View>
      {frame(false)}
      <TouchableOpacity style={styles.mapOpenButton} onPress={() => setExpanded(true)}
        accessibilityRole="button" testID={`${testID}-expand`}>
        <AppText style={styles.mapFailureRetryText}>{copy.mapExpand}</AppText>
      </TouchableOpacity>
      {expanded ? (
        <Modal visible animationType="slide" onRequestClose={() => setExpanded(false)}>
          <View style={styles.mapExpandedScreen}>
            <View style={styles.mapExpandedHeader}>
              <TouchableOpacity style={styles.mapControlButton} onPress={() => setExpanded(false)}
                accessibilityRole="button" testID={`${testID}-close`}>
                <AppText style={styles.mapFailureRetryText}>{copy.mapClose}</AppText>
              </TouchableOpacity>
              <AppText style={styles.mapExpandedTitle} numberOfLines={2}>{place?.name || title}</AppText>
            </View>
            <AppText style={styles.mapHelp}>{copy.mapInteract}</AppText>
            {frame(true)}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
