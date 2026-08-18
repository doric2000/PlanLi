import React from 'react';
import { ActivityIndicator, FlatList, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import CityCard from '../../../components/CityCard';
import EmptyState from '../../../components/EmptyState';
import { useFavoriteCityIds } from '../../../hooks/useFavoriteCityIds';
import { colors } from '../../../styles';
import { favoritesStyles as styles, getGridTileWidth } from './favoritesStyles';

export default function FavoriteCitiesList({ flatListRef, onScroll }) {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { favorites, loading } = useFavoriteCityIds();
  const columns = width >= 760 ? 3 : 2;
  const tileWidth = getGridTileWidth(width, columns);

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <FlatList
      key={`favorite-destinations-${columns}`}
      ref={flatListRef}
      data={favorites}
      numColumns={columns}
      keyExtractor={(item) => `${item.countryId}:${item.id}`}
      onScroll={onScroll}
      scrollEventThrottle={16}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={[styles.destinationWrap, { width: tileWidth }]}>
          <CityCard
            city={{
              ...item,
              name: item.name || item.title || 'יעד',
              country: item.countryName || item.country || item.countryId,
            }}
            variant="home"
            showTravelers={false}
            onPress={() => navigation.navigate('LandingPage', { cityId: item.id, countryId: item.countryId })}
            style={{ width: '100%' }}
          />
        </View>
      )}
      ListEmptyComponent={<EmptyState icon="place" title="עוד אין יעדים שמורים" message="יעדים שתשמרו יופיעו כאן." />}
    />
  );
}
