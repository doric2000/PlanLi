import React from 'react';
import { ActivityIndicator, FlatList, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import ContentTile, { getContentGridColumns } from '../../../components/ContentTile';
import EmptyState from '../../../components/EmptyState';
import { colors } from '../../../styles';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { getRecommendationMapVisual } from '../../community/utils/recommendationMap';
import { favoritesStyles as styles, getGridTileWidth } from './favoritesStyles';

export default function FavoriteRecommendationsList({ favorites, loading, flatListRef, onScroll }) {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const columns = getContentGridColumns(width);
  const tileWidth = getGridTileWidth(width, columns);

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <FlatList
      key={`favorite-recommendations-${columns}`}
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
      renderItem={({ item }) => {
        const visual = getRecommendationMapVisual(item?.categoryId, item?.category);
        return (
          <View style={[styles.tileWrap, { width: tileWidth }]}>
            <ContentTile
              image={getRecommendationImageUrls(item, 'thumb')[0] || item.thumbnail_url || null}
              title={item.title || item.name || 'המלצה'}
              subtitle={item?.destination?.cityName || item?.destination?.countryName || ''}
              icon={visual.icon}
              fallbackColor={visual.color}
              onPress={() => navigation.navigate('RecommendationDetail', { postId: item.id })}
            />
          </View>
        );
      }}
      ListEmptyComponent={<EmptyState icon="bookmark-border" title="עוד אין המלצות שמורות" message="המלצות שתשמרו יופיעו כאן." />}
    />
  );
}
