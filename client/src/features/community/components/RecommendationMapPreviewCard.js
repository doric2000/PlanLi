import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import CachedImage from '../../../components/CachedImage';
import { getBudgetLabel } from '../../../constants/travelTaxonomy';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { colors, community } from '../../../styles';
import { getRecommendationMapVisual } from '../utils/recommendationMap';

function getLocationLabel(item) {
  const parts = [
    item?.place?.name,
    item?.destination?.cityName,
    item?.destination?.countryName,
  ].filter(Boolean);
  return Array.from(new Set(parts)).join(', ');
}

export default function RecommendationMapPreviewCard({
  item,
  bottomInset,
  onClose,
  onOpenRecommendation,
}) {
  const visual = useMemo(
    () => getRecommendationMapVisual(item?.categoryId, item?.category),
    [item?.category, item?.categoryId]
  );
  const imageUrl = getRecommendationImageUrls(item, 'thumb')[0] || '';
  const locationLabel = getLocationLabel(item);
  const budgetLabel = item?.budget ? getBudgetLabel(item.budget) : '';
  const likeCount = Number(item?.stats?.likeCount);
  const hasLikes = Number.isFinite(likeCount) && likeCount >= 0;

  if (!item) return null;

  return (
    <View
      style={[community.mapPreviewCard, { bottom: bottomInset }]}
      testID="recommendation-map-preview"
      accessibilityLiveRegion="polite"
    >
      <View style={community.mapPreviewRow}>
        {imageUrl ? (
          <CachedImage
            source={{ uri: imageUrl }}
            style={community.mapPreviewImage}
            contentFit="cover"
            transition={100}
            accessibilityLabel={`תמונה של ${item.title || 'ההמלצה'}`}
          />
        ) : (
          <View
            style={community.mapPreviewImagePlaceholder}
            testID="recommendation-map-preview-placeholder"
          >
            <MaterialIcons name={visual.icon} size={36} color={colors.textSecondary} />
          </View>
        )}

        <View style={community.mapPreviewContent}>
          <View style={community.mapPreviewHeaderRow}>
            <View style={community.mapPreviewCategory} testID="recommendation-map-preview-category">
              <MaterialIcons name={visual.icon} size={15} color={colors.textSecondary} />
              <Text style={community.mapPreviewCategoryText}>
                {visual.label}
              </Text>
            </View>

            <TouchableOpacity
              style={community.mapPreviewCloseButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="סגור פרטי המלצה"
              testID="recommendation-map-preview-close"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={community.mapPreviewTitle} numberOfLines={2}>
            {item.title || 'המלצה'}
          </Text>

          {!!locationLabel && (
            <View style={community.mapPreviewLocationRow}>
              <Ionicons name="location-outline" size={15} color={colors.textMuted} />
              <Text style={community.mapPreviewLocationText} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
          )}

          {(budgetLabel || hasLikes) && (
            <View style={community.mapPreviewMetaRow}>
              {!!budgetLabel && (
                <View style={community.mapPreviewMetaItem}>
                  <Ionicons name="wallet-outline" size={14} color={colors.textSecondary} />
                  <Text style={community.mapPreviewMetaText}>{budgetLabel}</Text>
                </View>
              )}
              {hasLikes && (
                <View style={community.mapPreviewMetaItem}>
                  <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
                  <Text style={community.mapPreviewMetaText}>{likeCount}</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={community.mapPreviewPrimaryButton}
            onPress={() => onOpenRecommendation?.(item?.postId || item?.id)}
            accessibilityRole="button"
            accessibilityLabel={`לפרטי ההמלצה ${item.title || ''}`.trim()}
            testID="recommendation-map-preview-open"
          >
            <Text style={community.mapPreviewPrimaryButtonText}>לפרטי ההמלצה</Text>
            <Ionicons name="chevron-back" size={17} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
