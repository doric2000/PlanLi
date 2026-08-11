import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';
import { cards, cityCardStyles as styles } from '../styles';
import CachedImage from './CachedImage';
import PreferenceContextLine from './PreferenceContextLine';
import PhotoAttribution from './PhotoAttribution';
import { getDestinationImageUrl, getDestinationPlaceholderColor } from '../utils/destinationImages';

/**
 * CityCard - displays a city with image, name, country, and travelers count
 * @param {Object} props
 * @param {Object} props.city - City data (id, name, countryId, imageUrl, travelers)
 * @param {Function} props.onPress - Callback when card is pressed
 */
export default function CityCard({
  city,
  onPress,
  style,
  variant = 'default',
  showTravelers = true,
  showSaveButton = false,
  saved,
  onSavePress,
}) {
  const imageUrl = getDestinationImageUrl(city, variant === 'home' ? 'feed' : 'thumb');
  const isHomeVariant = variant === 'home';
  const cardStyle = isHomeVariant ? styles.homeCard : cards.popular;
  const imageContainerStyle = isHomeVariant ? styles.homeImageContainer : cards.popularImageContainer;
  const imageStyle = isHomeVariant ? styles.homeImage : cards.popularImage;
  const infoStyle = isHomeVariant ? styles.homeInfo : cards.popularInfo;
  const cityName = city?.identity?.names?.he || city?.names?.he || city?.name || city?.id || '';
  const countryName = city?.country || city?.countryNames?.he || city?.countryName || city?.countryId || '';
  const travelers = city?.travelers ?? 0;
  const effectiveSaved = Boolean(saved);
  const personalizationReasonCode = city?.personalization?.reasonCodes?.[0];

  return (
    <TouchableOpacity
      style={[cardStyle, style]}
      onPress={onPress}
      activeOpacity={0.9}
      testID={`city-card-${city?.id}`}
    >
      <View style={imageContainerStyle}>
        {imageUrl ? (
          <CachedImage
            source={{ uri: imageUrl }}
            style={imageStyle}
            contentFit="cover"
            priority="low"
          />
        ) : (
          <View
            style={[
              isHomeVariant ? styles.homeImagePlaceholder : cards.popularImagePlaceholder,
              { backgroundColor: getDestinationPlaceholderColor(city) },
            ]}
          />
        )}
        {isHomeVariant && <View style={styles.homeImageOverlay} />}
        <PhotoAttribution destination={city} />
        {showSaveButton && (
          <TouchableOpacity
            style={[styles.saveButton, effectiveSaved && styles.saveButtonActive]}
            onPress={onSavePress}
            activeOpacity={0.85}
            disabled={!onSavePress}
            accessibilityRole="button"
            accessibilityLabel={effectiveSaved ? 'הסרה מהמועדפים' : 'שמירה במועדפים'}
          >
            <Ionicons
              name={effectiveSaved ? 'bookmark' : 'bookmark-outline'}
              size={15}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={infoStyle}>
        <AppText
          style={isHomeVariant ? styles.homeCity : cards.popularCity}
          numberOfLines={1}
          testID="city-card"
        >
          {cityName}
        </AppText>
        <AppText
          style={isHomeVariant ? styles.homeCountry : cards.popularCountry}
          numberOfLines={1}
        >
          {countryName}
        </AppText>
        <PreferenceContextLine reasonCode={personalizationReasonCode} />
        {showTravelers && (
          <View style={isHomeVariant ? styles.homeMetaRow : cards.popularTravelerRow}>
            <View style={isHomeVariant ? styles.homeMetaItem : cards.popularTravelerRow}>
              <Ionicons name="location-outline" size={13} color={isHomeVariant ? '#1B2D7A' : '#666'} />
              <AppText style={isHomeVariant ? styles.homeTravelerText : cards.popularTravelerText}>
                {travelers} מטיילים
              </AppText>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
