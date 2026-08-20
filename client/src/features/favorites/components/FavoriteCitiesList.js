import React from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import CityCard from '../../../components/CityCard';
import EmptyState from '../../../components/EmptyState';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import { favoritesStyles as styles, getGridTileWidth } from './favoritesStyles';

export default function FavoriteCitiesList({
  favorites,
  loading,
  error,
  refreshing,
  confirming,
  onRefresh,
  flatListRef,
  onScroll,
}) {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const columns = width >= 760 ? 3 : 2;
  const tileWidth = getGridTileWidth(width, columns);

  return (
    <FlatList
      style={styles.list}
      key={`favorite-destinations-${columns}`}
      ref={flatListRef}
      data={loading || refreshing || confirming ? [] : favorites}
      numColumns={columns}
      keyExtractor={(item) => `${item.countryId}:${item.id}`}
      onScroll={onScroll}
      scrollEventThrottle={16}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.listContent}
      refreshControl={<CenteredRefreshControl refreshing={refreshing || confirming} onRefresh={onRefresh} />}
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
      ListEmptyComponent={loading || refreshing || confirming ? <CenteredRefreshState
        accessibilityLabel={confirming ? 'המועדפים מעודכנים' : refreshing ? 'מרענן מועדפים' : 'טוען מועדפים'}
        confirming={confirming}
        style={styles.bodyState}
        testID={confirming ? 'favorites-refresh-confirmation' : refreshing ? 'favorites-refresh-state' : 'favorites-loading-state'}
      /> : <View style={styles.bodyState}><EmptyState
        icon={error ? 'cloud-off' : 'place'}
        title={error ? 'לא הצלחנו לעדכן את המועדפים' : 'עוד אין יעדים שמורים'}
        message={error ? 'אפשר למשוך שוב מטה ולנסות מחדש.' : 'יעדים שתשמרו יופיעו כאן.'}
      /></View>}
    />
  );
}
