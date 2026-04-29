import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { common } from '../../../styles/common';
import { typography } from '../../../styles/typography';
import { FAVORITE_CARD_WIDTH } from '../../../styles/cards';
import { RouteCard } from '../../roadtrip/components/RouteCard';

export default function FavoriteRoadTripsList({ favorites, loading, flatListRef, onScroll }) {
  const navigation = useNavigation();

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
        <Text style={typography.h2}>מסלולים שמורים</Text>
        <Text style={typography.body}>כאן תוכל לראות את כל המסלולים ששמרת</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={favorites}
      keyExtractor={(item) => item.id}
      onScroll={onScroll}
      scrollEventThrottle={16}
      renderItem={({ item }) => (
        <View style={{ alignItems: 'center', width: '100%' }}>
          <View style={{ width: FAVORITE_CARD_WIDTH, maxWidth: '95%' }}>
            <RouteCard
              item={item}
              onPress={() => navigation.navigate('RouteDetail', { routeData: item })}
              isOwner={false}
              showActionBar={false}
              showActionMenu={false}
            />
          </View>
        </View>
      )}
      contentContainerStyle={{ padding: 16, alignItems: 'center' }}
    />
  );
}
