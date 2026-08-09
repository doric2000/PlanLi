import React from 'react';
import { ActivityIndicator, FlatList, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import ContentTile, { getContentGridColumns } from '../../../components/ContentTile';
import EmptyState from '../../../components/EmptyState';
import { colors } from '../../../styles';
import { loadRouteDetails } from '../../../services/RouteService';
import { getRouteImageUrls } from '../../../utils/mediaAssets';
import { favoritesStyles as styles, getGridTileWidth } from './favoritesStyles';

export default function FavoriteRoadTripsList({ favorites, loading, flatListRef, onScroll }) {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const columns = getContentGridColumns(width);
  const tileWidth = getGridTileWidth(width, columns);

  const openRoute = async (item) => {
    try {
      const routeData = await loadRouteDetails(item.id);
      if (routeData) navigation.navigate('RouteDetail', { routeData });
    } catch (error) {
      console.error('Failed to load favorite route:', error);
    }
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <FlatList
      key={`favorite-routes-${columns}`}
      ref={flatListRef}
      data={favorites}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      onScroll={onScroll}
      scrollEventThrottle={16}
      initialNumToRender={columns * 2}
      maxToRenderPerBatch={columns * 2}
      windowSize={7}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={[styles.tileWrap, { width: tileWidth }]}>
          <ContentTile
            image={getRouteImageUrls(item, 'thumb')[0] || item.thumbnail_url || null}
            title={item.Title || item.title || item.name || 'מסלול'}
            subtitle={Array.isArray(item.summaryPlaces) ? item.summaryPlaces.filter(Boolean).slice(0, 2).join(' · ') : ''}
            icon="map"
            fallbackColor={colors.brand}
            onPress={() => openRoute(item)}
          />
        </View>
      )}
      ListEmptyComponent={<EmptyState icon="map" title="עוד אין מסלולים שמורים" message="מסלולים שתשמרו יופיעו כאן." />}
    />
  );
}
