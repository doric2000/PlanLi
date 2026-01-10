import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { common, typography, colors } from '../styles';

export const RecommendationMeta = ({ item, navigation }) => {
  const openInGoogleMaps = () => {
    const coords = item?.place?.coordinates;
    const placeId = item?.place?.placeId;
    const fallbackQuery = item?.place?.name || item?.location || '';

    const hasCoords = coords && typeof coords.lat === 'number' && typeof coords.lng === 'number';
    const query = hasCoords ? `${coords.lat},${coords.lng}` : fallbackQuery;
    if (!query) return;

    let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    if (placeId) {
      url += `&query_place_id=${encodeURIComponent(placeId)}`;
    }

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

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  rowButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EEF5',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  mapsButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(46,196,182,0.30)',
    backgroundColor: 'rgba(46,196,182,0.10)',
  },
  icon: {
    marginLeft: 8,
  },
  rowText: {
    color: colors.textSecondary,
    textAlign: 'right',
    flexShrink: 1,
  },
  mapsText: {
    color: colors.textPrimary,
    fontWeight: '800',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EEF5',
    marginVertical: 12,
  },
  badgesRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
