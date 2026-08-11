import React from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { community } from '../../../styles';

function googleMapsUrl(item) {
  const place = item?.place || {};
  const coordinates = place.coordinates || item?.coordinates;
  const query = place.name || place.address || (coordinates ? `${coordinates.lat},${coordinates.lng}` : '');
  if (!query) return null;
  let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  if (place.placeId) url += `&query_place_id=${encodeURIComponent(place.placeId)}`;
  return url;
}

export default function CommunityInlineMap({ recommendations = [], onOpenRecommendation }) {
  return (
    <View style={community.inlineMapEmpty} testID="community-map-web-list">
      <Ionicons name="map-outline" size={40} color="#6B7280" />
      <AppText style={community.inlineMapEmptyTitle}>Explore recommendations</AppText>
      <AppText style={community.inlineMapEmptyText}>Open an exact place in Google Maps. The interactive map is available in the native apps.</AppText>
      {recommendations.slice(0, 20).map((item) => (
        <TouchableOpacity
          key={item.id}
          style={community.mapLocationNotice}
          onPress={() => onOpenRecommendation?.(item.postId || item.id)}
          testID={`community-map-web-item-${item.id}`}
        >
          <AppText style={community.mapLocationNoticeText}>{item.title}</AppText>
          <TouchableOpacity onPress={() => Linking.openURL(googleMapsUrl(item)).catch(() => {})} disabled={!googleMapsUrl(item)}>
            <Ionicons name="navigate-outline" size={18} color="#1E3A5F" />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}
