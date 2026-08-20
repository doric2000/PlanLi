import React from 'react';
import { StyleSheet } from 'react-native';

import { exactLocationPickerStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';

export default function ExactLocationMapPreview({ place }) {
  const coordinates = getPlaceCoordinates(place);
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const embedKey = String(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
    ''
  ).trim();
  const query = place?.placeId ? `place_id:${place.placeId}` : `${lat},${lng}`;
  const src = embedKey
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(query)}`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=15&output=embed`;
  return React.createElement('iframe', {
    title: place?.name || 'תצוגה מקדימה של המיקום',
    src,
    style: StyleSheet.flatten(styles.previewMap),
    loading: 'lazy',
    referrerPolicy: 'no-referrer-when-downgrade',
    'data-testid': 'exact-location-map-preview',
  });
}
