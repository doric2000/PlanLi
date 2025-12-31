
import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { common } from '../../../styles/common';
import { typography } from '../../../styles/typography';
import { FAVORITE_CARD_WIDTH } from '../../../styles/cards';
import CityCard from '../../../components/CityCard';
import { useFavoriteCityIds } from '../../../hooks/useFavoriteCityIds';

export default function FavoriteCitiesList() {
  const navigation = useNavigation();
  const { favorites, loading } = useFavoriteCityIds();

  if (loading) {
    return (
      <View style={common.containerCentered}>
        <ActivityIndicator size="large" color="#49bc8e" />
      </View>
    );
  }

  if (!favorites.length) {
    return (
      <View style={common.containerCentered}>
        <Text style={typography.h2}>היעדים המועדפים שלך</Text>
        <Text style={typography.body}>לא שמרת יעדים עדיין</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={favorites}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <CityCard
          key={item.id}
					city={{
						id: item.id,
						name: item.name || item.title || 'Unknown',
						countryId: item.countryId,
						imageUrl: item.thumbnail_url,
						rating: item.rating,
            travelers: item.travelers || 0,
					}}
          showTravelers={false}
          onPress={() => navigation.navigate('LandingPage', {
            cityId: item.id,
            countryId: item.countryId
          })}
          style={{ width: FAVORITE_CARD_WIDTH, maxWidth: '95%' }}
        />                
      )}
      contentContainerStyle={{ padding: 16, alignItems: 'center' }}
    />
  );
}
