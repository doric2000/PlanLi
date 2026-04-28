import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { common, typography, colors, recommendationMetaStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';

export const RecommendationMeta = ({ item, navigation }) => {
  const openInGoogleMaps = () => {
    const place = item?.place;
    const placeId = place?.placeId;

    // Best option: open the Google Place URL directly (most precise).
    if (place?.url) {
      Linking.openURL(place.url).catch(() => {});
      return;
    }

    // Next best: open by coordinates.
    const coords = getPlaceCoordinates(place);
    const hasCoords = !!coords;

    const fallbackQuery = [
      place?.name,
      place?.address,
      item?.location,
      item?.country,
    ]
      .filter(Boolean)
      .join(' ');

    const query = hasCoords ? `${coords.lat},${coords.lng}` : fallbackQuery;
    if (!query) return;

    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    if (placeId) url += `&query_place_id=${encodeURIComponent(placeId)}`;

    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      {(item.location || item.country) && (
        <TouchableOpacity
          style={styles.rowButton}
          activeOpacity={0.75}
          onPress={() => {
            if (item.cityId && item.countryId) {
              navigation.navigate('LandingPage', {
                cityId: item.cityId,
                countryId: item.countryId,
              });
            }
          }}
        >
          <Ionicons name="location" size={16} color={colors.primary} style={styles.icon} />
          <Text style={[typography.body, styles.rowText]}>
            {item.location}{item.country ? `, ${item.country}` : ''}
          </Text>
          <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {!!(item?.place?.placeId || item?.place?.coordinates) && (
        <TouchableOpacity style={styles.mapsButton} activeOpacity={0.85} onPress={openInGoogleMaps}>
          <Ionicons name="map-outline" size={18} color={colors.primary} style={styles.icon} />
          <Text style={[typography.body, styles.mapsText]}>פתח בגוגל מפות</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {item.rating && <View style={styles.divider} />}

      <View style={styles.badgesRow}>
        {item.rating && (
          <View style={common.ratingContainer}>
            <Text style={common.ratingStar}>★</Text>
            <Text style={common.ratingText}>{item.rating}</Text>
          </View>
        )}
      </View>
    </View>
  );
};
