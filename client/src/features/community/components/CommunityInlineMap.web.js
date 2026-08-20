import React, { useMemo } from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { community } from '../../../styles';
import { buildGoogleMapsUrl } from '../../../utils/placeNavigation';

function googleMapsUrl(item) {
  const place = item?.place || {};
  const coordinates = place.coordinates || item?.coordinates;
  return buildGoogleMapsUrl({
    place: { ...place, ...(place.coordinates ? {} : { coordinates }) },
    destination: item?.destination,
    fallback: item?.title,
  });
}

export default function CommunityInlineMap({
  recommendations = [],
  onOpenRecommendation,
  focusRequest = null,
}) {
  const focusedRecommendationId = String(focusRequest?.recommendationId || '').trim();
  const orderedRecommendations = useMemo(() => {
    if (!focusedRecommendationId) return recommendations;
    return [...recommendations].sort((left, right) => {
      const leftFocused = (left?.id || left?.postId) === focusedRecommendationId;
      const rightFocused = (right?.id || right?.postId) === focusedRecommendationId;
      return Number(rightFocused) - Number(leftFocused);
    });
  }, [focusedRecommendationId, recommendations]);

  return (
    <View style={community.inlineMapEmpty} testID="community-map-web-list">
      <Ionicons name="map-outline" size={40} color="#6B7280" />
      <AppText style={community.inlineMapEmptyTitle}>Explore recommendations</AppText>
      <AppText style={community.inlineMapEmptyText}>Open an exact place in Google Maps. The interactive map is available in the native apps.</AppText>
      {orderedRecommendations.slice(0, 20).map((item) => {
        const itemId = item?.id || item?.postId;
        const focused = itemId === focusedRecommendationId;
        return (
          <TouchableOpacity
            key={itemId}
            style={[community.mapLocationNotice, focused && community.mapWebFocusedItem]}
            onPress={() => onOpenRecommendation?.(item.postId || item.id)}
            testID={`community-map-web-item-${itemId}`}
            accessibilityState={{ selected: focused }}
          >
            <AppText style={community.mapLocationNoticeText}>{item.title}</AppText>
            <TouchableOpacity
              onPress={(event) => {
                event?.stopPropagation?.();
                Linking.openURL(googleMapsUrl(item)).catch(() => {});
              }}
              disabled={!googleMapsUrl(item)}
            >
              <Ionicons name="navigate-outline" size={18} color="#1E3A5F" />
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
