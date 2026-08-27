import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import AppText from "../../../components/AppText";
import { MaterialIcons } from '@expo/vector-icons';

import ContentTile from '../../../components/ContentTile';
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
  pendingCount = 0,
  showPending = false,
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
        <AppText style={[styles.contentTabText, isActive && styles.contentTabTextActive]}>
          {label} {count}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View style={styles.contentSection}>
      <View style={styles.contentIntroRow}>
        <AppText style={styles.contentTitle}>{title}</AppText>
        <AppText style={styles.contentCount}>רגעים ששווה לשמור</AppText>
      </View>
      <View style={styles.contentTabs} accessibilityRole="tablist">
        {renderTab('recommendations', 'המלצות', recommendationsCount, 'thumb-up')}
        {renderTab('routes', 'מסלולים', routesCount, 'map')}
        {showPending ? renderTab('pending', 'בבדיקה', pendingCount, 'schedule') : null}
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
  if (contentLoading) return null;

  const isPending = contentTab === 'pending';
  const isRecommendation = contentTab === 'recommendations'
    || (isPending && item?.contentType === 'recommendation');
  const image = isRecommendation
    ? item?.thumbnailUrl || getRecommendationImageUrls(item, 'thumb')[0] || null
    : getRouteImageUrls(item, 'thumb')[0] || null;
  const title = isRecommendation
    ? item?.title || item?.name || 'המלצה'
    : item?.Title || item?.title || 'מסלול';
  const subtitle = isPending
    ? (item?.contentType === 'route' ? 'מסלול ממתין לבדיקה' : 'המלצה ממתינה לבדיקה')
    : isRecommendation
    ? item?.destination?.cityName || item?.destination?.countryName || ''
    : Array.isArray(item?.summaryPlaces)
      ? item.summaryPlaces.filter(Boolean).slice(0, 2).join(' · ')
      : '';
  const visual = isPending
    ? { icon: 'schedule', color: '#B7791F' }
    : isRecommendation
    ? getRecommendationMapVisual(item?.categoryId, item?.category)
    : { icon: 'map', color: colors.primary };

  const handlePress = async () => {
    if (isPending) return;
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
    <ContentTile
      image={image}
      title={title}
      subtitle={subtitle}
      icon={visual.icon}
      fallbackColor={visual.color}
      onPress={handlePress}
      disabled={isPending}
      style={styles.gridTile}
    />
  );
}

export function ProfileContentEmpty({ contentTab, styles, ownerLabel = 'הפרופיל' }) {
  if (contentTab === 'pending') {
    return (
      <View style={styles.emptyState}>
        <MaterialIcons name="verified" size={36} color={colors.textMuted} />
        <AppText style={styles.emptyTitle}>אין פרסומים שממתינים לבדיקה</AppText>
        <AppText style={styles.emptyText}>כל התוכן שנשלח כבר טופל או פורסם.</AppText>
      </View>
    );
  }
  const recommendations = contentTab === 'recommendations';
  return (
    <View style={styles.emptyState}>
      <MaterialIcons
        name={recommendations ? 'photo-library' : 'map'}
        size={36}
        color={colors.textMuted}
      />
      <AppText style={styles.emptyTitle}>
        {recommendations ? 'עוד אין כאן המלצות' : 'עוד אין כאן מסלולים'}
      </AppText>
      <AppText style={styles.emptyText}>
        {recommendations
          ? `כשהמלצות של ${ownerLabel} יעלו, הן יופיעו כאן.`
          : `כשהמסלולים של ${ownerLabel} יעלו, הם יופיעו כאן.`}
      </AppText>
    </View>
  );
}
