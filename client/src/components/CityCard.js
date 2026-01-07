import React from 'react';
import { View, Text, Image, TouchableOpacity, Platform } from 'react-native';
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
export default function CityCard({ city, onPress, style }) {
  const rawImageUrl = city?.imageUrl;
  const imageUrl =
    Platform.OS === 'web' && isGooglePlacesPhotoUrl(rawImageUrl)
      ? DEFAULT_CITY_IMAGE_URL
      : rawImageUrl;

  return (
    <TouchableOpacity style={[cards.popular, style]} onPress={onPress}>
      <View style={cards.popularImageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={cards.popularImage}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              cards.popularImagePlaceholder,
              { backgroundColor: '#87CEEB' },
            ]}
          />
        )}
        <View style={cards.popularRatingBadge}>
          <Ionicons name="star" size={12} color="#FFD700" />
          <Text style={cards.popularRatingText}>{city.rating}</Text>
        </View>
      </View>
      <View style={cards.popularInfo}>
        <Text style={cards.popularCity}>{city.name || city.id}</Text>
        <Text style={cards.popularCountry}>{city.countryId}</Text>
        <View style={cards.popularTravelerRow}>
          <Ionicons name="location-outline" size={12} color="#666" />
          <Text style={cards.popularTravelerText}>
            {city.travelers || '0'} travelers
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
