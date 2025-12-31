
import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { common } from '../../../styles/common';
import { typography } from '../../../styles/typography';
import { FAVORITE_CARD_WIDTH } from '../../../styles/cards';
import RecommendationCard from '../../../components/RecommendationCard';
import { useFavoriteRecommendationIds } from '../../../hooks/useFavoriteRecommendationIds';
import { useFavoriteRecommendationsFull } from '../../../hooks/useFavoriteRecommendationsFull';

export default function FavoriteRecommendationsList() {
  // Use the new hook to get full recommendation objects
  const { favorites, loading } = useFavoriteRecommendationsFull();

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
        <Text style={typography.h2}>ההמלצות המועדפות שלך</Text>
        <Text style={typography.body}>לא שמרת המלצות עדיין</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={favorites}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={{ alignItems: 'center', width: '100%' }}>
          {/* ✅ FIX: We wrap the card in a View with the specific width. 
              The card will expand to fill this wrapper. */}
          <View style={{ width: FAVORITE_CARD_WIDTH, maxWidth: '95%' }}>
            <RecommendationCard
              item={{
                id: item.id,
                title: item.name || 'Untitled',
                description: item.sub_text || '',
                images: item.thumbnail_url ? [item.thumbnail_url] : [],
                rating: item.rating,
                ...item
              }}
              showActionBar={false}
              // ❌ We removed the 'style' prop from here since the component ignores it
            />
          </View>
        </View>
      )}
      contentContainerStyle={{ padding: 16, alignItems: 'center' }}
    />
  );
}
