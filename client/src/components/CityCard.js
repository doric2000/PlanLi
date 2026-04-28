import React from 'react';
import { View, Text, Image, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cards, cityCardStyles as styles } from '../styles';

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
