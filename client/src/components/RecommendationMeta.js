import React from 'react';
import { View, TouchableOpacity, Linking } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';
import { typography, colors, recommendationMetaStyles as styles } from '../styles';
import { getPlaceCoordinates } from '../utils/distance';
import { buildGoogleMapsUrl, buildWazeUrl } from '../utils/placeNavigation';
import NavigationChevron from './NavigationChevron';

export const RecommendationMeta = ({ item, navigation }) => {
  const destination = item?.destination || {};
  const openInGoogleMaps = () => {
    const url = buildGoogleMapsUrl({ place: item?.place, destination });
    if (url) Linking.openURL(url).catch(() => {});
  };
  const openInWaze = () => {
    const url = buildWazeUrl(item?.place);
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      {(destination.cityName || destination.countryName) && (
        <TouchableOpacity
          style={styles.rowButton}
          activeOpacity={0.75}
          onPress={() => {
            if (destination.cityId && destination.countryId) {
              navigation.navigate('LandingPage', {
                cityId: destination.cityId,
                countryId: destination.countryId,
              });
            }
          }}
        >
          <NavigationChevron size={18} color={colors.textMuted} />
          <Ionicons name="location" size={16} color={colors.primary} style={styles.icon} />
          <AppText style={[typography.body, styles.rowText]}>
            {destination.cityName}{destination.countryName ? `, ${destination.countryName}` : ''}
          </AppText>
        </TouchableOpacity>
      )}

      {!!(item?.place?.placeId || item?.place?.coordinates) && (
        <TouchableOpacity style={styles.mapsButton} activeOpacity={0.85} onPress={openInGoogleMaps}>
          <NavigationChevron size={18} color={colors.textMuted} />
          <Ionicons name="map-outline" size={18} color={colors.primary} style={styles.icon} />
          <AppText style={[typography.body, styles.mapsText]}>פתח בגוגל מפות</AppText>
          <View style={{ flex: 1 }} />
        </TouchableOpacity>
      )}
      {!!getPlaceCoordinates(item?.place) && (
        <TouchableOpacity style={styles.mapsButton} activeOpacity={0.85} onPress={openInWaze}>
          <NavigationChevron size={18} color={colors.textMuted} />
          <Ionicons name="navigate-outline" size={18} color={colors.primary} style={styles.icon} />
          <AppText style={[typography.body, styles.mapsText]}>פתח ב-Waze</AppText>
          <View style={{ flex: 1 }} />
        </TouchableOpacity>
      )}
    </View>
  );
};
