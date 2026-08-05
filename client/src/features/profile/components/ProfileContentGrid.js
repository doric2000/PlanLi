import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import CachedImage from '../../../components/CachedImage';
import { colors } from '../../../styles';
import { getRecommendationMapVisual } from '../../community/utils/recommendationMap';
import {
  getRecommendationImageUrls,
  getRouteImageUrls,
} from '../../../utils/mediaAssets';
import { loadRouteDetails } from '../../../services/RouteService';

export function ProfileContentHeader({
  styles,
  contentTab,
  onChangeTab,
  contentLoading,
  recommendationsCount = 0,
  routesCount = 0,
  title = 'התוכן שלי',
}) {
  const renderTab = (tab, label, count, icon) => {
    const isActive = contentTab === tab;
    return (
      <Pressable
        key={tab}
        onPress={() => onChangeTab(tab)}
        style={[styles.contentTab, isActive && styles.contentTabActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`${label}, ${count}`}
      >
        <MaterialIcons
          name={icon}
          size={18}
          color={isActive ? colors.white : colors.textSecondary}
        />
        <Text style={[styles.contentTabText, isActive && styles.contentTabTextActive]}>
          {label} {count}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.contentSection}>
      <View style={styles.contentIntroRow}>
        <Text style={styles.contentTitle}>{title}</Text>
        <Text style={styles.contentCount}>רגעים ששווה לשמור</Text>
      </View>
      <View style={styles.contentTabs} accessibilityRole="tablist">
        {renderTab('recommendations', 'המלצות', recommendationsCount, 'thumb-up')}
        {renderTab('routes', 'מסלולים', routesCount, 'map')}
      </View>
      {contentLoading ? (
        <View style={styles.contentLoading}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}
export function ProfileGridTile({ item, contentTab, contentLoading, navigation, styles }) {
  const [revealed, setRevealed] = useState(false);
  if (contentLoading) return null;

  const isRecommendation = contentTab === 'recommendations';
  const image = isRecommendation
    ? getRecommendationImageUrls(item, 'thumb')[0] || null
    : getRouteImageUrls(item, 'thumb')[0] || null;
  const title = isRecommendation
    ? item?.title || item?.name || 'המלצה'
    : item?.Title || item?.title || 'מסלול';
  const subtitle = isRecommendation
    ? item?.destination?.cityName || item?.destination?.countryName || ''
    : Array.isArray(item?.summaryPlaces)
      ? item.summaryPlaces.filter(Boolean).slice(0, 2).join(' · ')
      : '';
  const visual = isRecommendation
    ? getRecommendationMapVisual(item?.categoryId, item?.category)
    : { icon: 'map', color: colors.primary };
  const showOverlay = Platform.OS === 'web' && revealed;

  const handlePress = async () => {
    if (isRecommendation) {
      navigation.navigate('RecommendationDetail', { item });
      return;
    }
    try {
      const routeData = await loadRouteDetails(item.id);
      if (routeData) navigation.navigate('RouteDetail', { routeData });
    } catch {
      // A stale route tile should not break the rest of the profile grid.
    }
  };

  return (
    <Pressable
      style={styles.gridTile}
      onPress={handlePress}
      onHoverIn={() => setRevealed(true)}
      onHoverOut={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`}
    >
      {image ? (
        <CachedImage
          source={{ uri: image }}
          style={Platform.OS === 'web' ? styles.gridImageWeb : styles.gridImage}
          contentFit="cover"
          priority="low"
        />
      ) : (
        <View style={[styles.gridFallback, { backgroundColor: visual.color }]}>
          <MaterialIcons name={visual.icon} size={34} color={colors.white} />
        </View>
      )}
      <View style={styles.gridShade} pointerEvents="none" />
      <View style={styles.gridTypeBadge} pointerEvents="none">
        <MaterialIcons name={visual.icon} size={16} color={colors.white} />
      </View>
      {showOverlay ? (
        <View style={styles.gridOverlay} pointerEvents="none">
          <Text style={styles.gridOverlayTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.gridOverlaySubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function ProfileContentEmpty({ contentTab, styles, ownerLabel = 'הפרופיל' }) {
  const recommendations = contentTab === 'recommendations';
  return (
    <View style={styles.emptyState}>
      <MaterialIcons
        name={recommendations ? 'photo-library' : 'map'}
        size={36}
        color={colors.textMuted}
      />
      <Text style={styles.emptyTitle}>
        {recommendations ? 'עוד אין כאן המלצות' : 'עוד אין כאן מסלולים'}
      </Text>
      <Text style={styles.emptyText}>
        {recommendations
          ? `כשהמלצות של ${ownerLabel} יעלו, הן יופיעו כאן.`
          : `כשהמסלולים של ${ownerLabel} יעלו, הם יופיעו כאן.`}
      </Text>
    </View>
  );
}
