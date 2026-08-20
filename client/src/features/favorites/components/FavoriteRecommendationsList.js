import React from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import ContentTile, { getContentGridColumns } from '../../../components/ContentTile';
import EmptyState from '../../../components/EmptyState';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { getRecommendationMapVisual } from '../../community/utils/recommendationMap';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import { favoritesStyles as styles, getGridTileWidth } from './favoritesStyles';

export default function FavoriteRecommendationsList({ favorites, loading, error, refreshing, confirming, onRefresh, flatListRef, onScroll }) {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const columns = getContentGridColumns(width);
  const tileWidth = getGridTileWidth(width, columns);

  return (
    <FlatList
      style={styles.list}
      key={`favorite-recommendations-${columns}`}
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
      ListEmptyComponent={loading || refreshing || confirming ? <CenteredRefreshState
        accessibilityLabel={confirming ? 'המועדפים מעודכנים' : refreshing ? 'מרענן מועדפים' : 'טוען מועדפים'}
        confirming={confirming}
        style={styles.bodyState}
        testID={confirming ? 'favorites-refresh-confirmation' : refreshing ? 'favorites-refresh-state' : 'favorites-loading-state'}
      /> : <View style={styles.bodyState}><EmptyState
        icon={error ? 'cloud-off' : 'bookmark-border'}
        title={error ? 'לא הצלחנו לעדכן את המועדפים' : 'עוד אין המלצות שמורות'}
        message={error ? 'אפשר למשוך שוב מטה ולנסות מחדש.' : 'המלצות שתשמרו יופיעו כאן.'}
      /></View>}
    />
  );
}
