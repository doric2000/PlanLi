import React from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import ContentTile, { getContentGridColumns } from '../../../components/ContentTile';
import EmptyState from '../../../components/EmptyState';
import { colors } from '../../../styles';
import { loadRouteDetails } from '../../../services/RouteService';
import { getRouteImageUrls } from '../../../utils/mediaAssets';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import { favoritesStyles as styles, getGridTileWidth } from './favoritesStyles';

export default function FavoriteRoadTripsList({ favorites, loading, error, refreshing, confirming, onRefresh, flatListRef, onScroll }) {
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

  return (
    <FlatList
      style={styles.list}
      key={`favorite-routes-${columns}`}
      ref={flatListRef}
      data={loading || refreshing || confirming ? [] : favorites}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      onScroll={onScroll}
      scrollEventThrottle={16}
      initialNumToRender={columns * 2}
      maxToRenderPerBatch={columns * 2}
      windowSize={7}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.listContent}
      refreshControl={<CenteredRefreshControl refreshing={refreshing || confirming} onRefresh={onRefresh} />}
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
      ListEmptyComponent={loading || refreshing || confirming ? <CenteredRefreshState
        accessibilityLabel={confirming ? 'המועדפים מעודכנים' : refreshing ? 'מרענן מועדפים' : 'טוען מועדפים'}
        confirming={confirming}
        style={styles.bodyState}
        testID={confirming ? 'favorites-refresh-confirmation' : refreshing ? 'favorites-refresh-state' : 'favorites-loading-state'}
      /> : <View style={styles.bodyState}><EmptyState
        icon={error ? 'cloud-off' : 'map'}
        title={error ? 'לא הצלחנו לעדכן את המועדפים' : 'עוד אין מסלולים שמורים'}
        message={error ? 'אפשר למשוך שוב מטה ולנסות מחדש.' : 'מסלולים שתשמרו יופיעו כאן.'}
      /></View>}
    />
  );
}
