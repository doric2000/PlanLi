import React from 'react';
import { View, Text, Image, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cards } from '../styles';

const DEFAULT_CITY_IMAGE_URL = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800';

const isGooglePlacesPhotoUrl = (uri) =>
  typeof uri === 'string' &&
  (uri.includes('/maps/api/place/photo') || uri.includes('maps.googleapis.com/maps/api/place/photo'));

/**
 * CityCard - displays a city with image, rating, name, country, and travelers count
 * @param {Object} props
 * @param {Object} props.city - City data (id, name, countryId, imageUrl, rating, travelers)
 * @param {Function} props.onPress - Callback when card is pressed
 */
export default function CityCard({
  city,
  onPress,
  style,
  variant = 'default',
  showTravelers = true,
  showSaveButton = false,
  saved = false,
  onSavePress,
}) {
  const rawImageUrl = city?.imageUrl;
  const imageUrl =
    Platform.OS === 'web' && isGooglePlacesPhotoUrl(rawImageUrl)
      ? DEFAULT_CITY_IMAGE_URL
      : rawImageUrl;
  const isHomeVariant = variant === 'home';
  const cardStyle = isHomeVariant ? styles.homeCard : cards.popular;
  const imageContainerStyle = isHomeVariant ? styles.homeImageContainer : cards.popularImageContainer;
  const imageStyle = isHomeVariant ? styles.homeImage : cards.popularImage;
  const infoStyle = isHomeVariant ? styles.homeInfo : cards.popularInfo;
  const cityName = city?.name || city?.id || '';
  const countryName = city?.country || city?.countryName || city?.countryId || '';
  const travelers = city?.travelers ?? 0;
  const rating = city?.rating || city?.recommendationsCount || null;

  return (
    <TouchableOpacity
      style={[cardStyle, style]}
      onPress={onPress}
      activeOpacity={0.9}
      testID={`city-card-${city?.id}`}
    >
      <View style={imageContainerStyle}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={imageStyle}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              isHomeVariant ? styles.homeImagePlaceholder : cards.popularImagePlaceholder,
              { backgroundColor: city?.placeholderColor || '#2D9CDB' },
            ]}
          />
        )}
        {isHomeVariant && <View style={styles.homeImageOverlay} />}
        {showSaveButton && (
          <TouchableOpacity
            style={[styles.saveButton, saved && styles.saveButtonActive]}
            onPress={onSavePress}
            activeOpacity={0.85}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={15}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={infoStyle}>
        <Text
          style={isHomeVariant ? styles.homeCity : cards.popularCity}
          numberOfLines={1}
          testID="city-card"
        >
          {cityName}
        </Text>
        <Text
          style={isHomeVariant ? styles.homeCountry : cards.popularCountry}
          numberOfLines={1}
        >
          {countryName}
        </Text>
        <View style={isHomeVariant ? styles.homeMetaRow : cards.popularTravelerRow}>
          {showTravelers && (
            <View style={isHomeVariant ? styles.homeMetaItem : cards.popularTravelerRow}>
              <Ionicons name="location-outline" size={13} color={isHomeVariant ? '#1B2D7A' : '#666'} />
              <Text style={isHomeVariant ? styles.homeTravelerText : cards.popularTravelerText}>
                {travelers} מטיילים
              </Text>
            </View>
          )}
          {isHomeVariant && rating ? (
            <View style={styles.homeMetaItem}>
              <Ionicons name="star" size={12} color="#F5961D" />
              <Text style={styles.homeRatingText}>{rating}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  homeCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#0F1729',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  homeImageContainer: {
    width: '100%',
    height: 120,
    position: 'relative',
    overflow: 'hidden',
  },
  homeImage: {
    width: '100%',
    height: '100%',
  },
  homeImagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  homeImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(10,20,60,0.18)',
  },
  saveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,41,0.28)',
  },
  saveButtonActive: {
    backgroundColor: 'rgba(245,150,29,0.88)',
  },
  homeInfo: {
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 12,
  },
  homeCity: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F1729',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  homeCountry: {
    fontSize: 12,
    color: '#8A90A8',
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  homeMetaRow: {
    minHeight: 18,
    marginTop: 9,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  homeMetaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
  },
  homeTravelerText: {
    fontSize: 11,
    color: '#1B2D7A',
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  homeRatingText: {
    fontSize: 11,
    color: '#F5961D',
    fontWeight: '700',
  },
});
