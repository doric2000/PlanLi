import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import CachedImage from '../../../components/CachedImage';
import FavoriteButton from '../../../components/FavoriteButton';
import { colors } from '../../../styles';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { createDestinationStyles } from '../components/destinationStyles';
import { useDestinationData } from '../hooks/useDestinationData';
import {
  availableCommunityFilters,
  buildEssentialRows,
  buildQuickFacts,
  buildSourceRows,
  filterCommunityRecommendations,
} from '../utils/destinationViewModel';

const PAGE_SIZE = 6;

function weatherIcon(conditionCode) {
  const condition = String(conditionCode || '').toLowerCase();
  if (condition.includes('clear')) return 'sunny-outline';
  if (condition.includes('cloud')) return 'cloudy-outline';
  if (condition.includes('rain') || condition.includes('drizzle')) return 'rainy-outline';
  if (condition.includes('snow')) return 'snow-outline';
  if (condition.includes('thunder')) return 'thunderstorm-outline';
  return 'partly-sunny-outline';
}

function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function meaningfulDescription(destination) {
  const description = String(destination?.description || '').trim();
  if (!description) return '';
  const normalized = (value) => String(value || '')
    .toLocaleLowerCase('he')
    .replace(/[\s,|·–—-]+/g, ' ')
    .trim();
  const titleOnly = normalized(
    `${destination?.name || ''} ${destination?.countryName || ''}`
  );
  return normalized(description) === titleOnly ? '' : description;
}

function FactCard({ fact, styles }) {
  const Icon = fact.iconLibrary === 'MaterialCommunityIcons'
    ? MaterialCommunityIcons
    : Ionicons;
  const iconName = fact.id === 'weather'
    ? weatherIcon(fact.conditionCode)
    : fact.icon;
  return (
    <View
      style={styles.quickCard}
      accessibilityLabel={[fact.title, fact.value, fact.detail].filter(Boolean).join(', ')}
    >
      <View style={[styles.factIcon, fact.id === 'weather' && styles.weatherIcon]}>
        <Icon
          name={iconName}
          size={20}
          color={fact.id === 'weather' ? '#D58A18' : colors.primary}
        />
      </View>
      <Text style={styles.factTitle}>{fact.title}</Text>
      <Text style={styles.factValue} numberOfLines={fact.id === 'airport' ? 2 : 1}>
        {fact.value}
      </Text>
      {!!fact.detail && <Text style={styles.factDetail}>{fact.detail}</Text>}
    </View>
  );
}

function EssentialCard({ rows, styles }) {
  return (
    <View style={styles.neutralCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>מידע שימושי</Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.essentialRow,
            index === rows.length - 1 && styles.essentialRowLast,
          ]}
        >
          <View style={styles.rowIcon}>
            <MaterialCommunityIcons name={row.icon} size={20} color={colors.primary} />
          </View>
          <Text style={styles.essentialLabel}>{row.label}</Text>
          <Text style={styles.essentialValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SourcesDisclosure({ rows, open, onToggle, styles }) {
  if (!rows.length) return null;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="מקורות ועדכון"
        onPress={onToggle}
        style={({ pressed }) => [styles.sourcesButton, pressed && { opacity: 0.72 }]}
      >
        <Text style={styles.sourcesButtonText}>מקורות ועדכון</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>
      {open && (
        <View style={styles.sourcesList}>
          {rows.map((row) => {
            const updatedAt = dateLabel(row.updatedAt);
            return (
              <Pressable
                key={row.id}
                disabled={!row.url}
                accessibilityRole={row.url ? 'link' : undefined}
                accessibilityLabel={`${row.label}: ${row.value}`}
                onPress={() => row.url && Linking.openURL(row.url)}
                style={({ pressed }) => [
                  styles.sourceRow,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.sourceLabel}>{row.label}</Text>
                <Text style={styles.sourceValue} numberOfLines={1}>
                  {[row.value, updatedAt].filter(Boolean).join(' · ')}
                </Text>
                {!!row.url && (
                  <Ionicons name="open-outline" size={13} color={colors.textLight} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function RecommendationPreview({ item, navigation, styles }) {
  const imageUrl = getRecommendationImageUrls(item, 'thumb')[0] || null;
  const category = item.category ||
    (item.categoryId === 'transportation' ? 'תחבורה' :
      item.tags?.includes?.('sim_esim') ? 'SIM וגלישה' : 'המלצה');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`פתיחת ההמלצה ${item.title || ''}`.trim()}
      onPress={() => navigation.navigate('RecommendationDetail', { item })}
      style={({ pressed }) => [
        styles.recommendationPreview,
        pressed && { opacity: 0.78 },
      ]}
    >
      {imageUrl ? (
        <CachedImage
          source={{ uri: imageUrl }}
          style={styles.recommendationImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.recommendationImageFallback}>
          <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
        </View>
      )}
      <View style={styles.recommendationBody}>
        <View style={styles.recommendationCategory}>
          <Text style={styles.recommendationCategoryText}>{category}</Text>
        </View>
        <Text style={styles.recommendationTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {!!item.description && (
          <Text style={styles.recommendationDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>
      <View style={styles.recommendationChevron}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
      </View>
    </Pressable>
  );
}

export default function LandingPageScreen({ navigation, route }) {
  const { cityId, countryId } = route?.params || {};
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createDestinationStyles(width, insets),
    [width, insets]
  );
  const {
    overview,
    recommendations,
    loading,
    error,
  } = useDestinationData(cityId, countryId);
  const [activeFilter, setActiveFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const quickFacts = useMemo(
    () => buildQuickFacts(overview?.quickFacts),
    [overview?.quickFacts]
  );
  const essentialRows = useMemo(
    () => buildEssentialRows(overview?.essentialFacts),
    [overview?.essentialFacts]
  );
  const sourceRows = useMemo(
    () => buildSourceRows(overview?.sources),
    [overview?.sources]
  );
  const filters = useMemo(
    () => availableCommunityFilters(recommendations),
    [recommendations]
  );
  const filteredRecommendations = useMemo(
    () => filterCommunityRecommendations(recommendations, activeFilter),
    [recommendations, activeFilter]
  );

  useEffect(() => {
    if (!filters.some((filter) => filter.id === activeFilter)) {
      setActiveFilter('all');
    }
  }, [activeFilter, filters]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeFilter, cityId, countryId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['left', 'right', 'bottom']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.errorText}>טוענים את היעד…</Text>
      </SafeAreaView>
    );
  }

  const destination = overview?.destination;
  if (!destination) {
    return (
      <SafeAreaView style={styles.loading} edges={['left', 'right', 'bottom']}>
        <Ionicons name="location-outline" size={38} color={colors.textLight} />
        <Text style={styles.errorText}>{error || 'היעד לא נמצא.'}</Text>
      </SafeAreaView>
    );
  }

  const snapshotData = {
    name: destination.name,
    thumbnail_url: destination.thumbnailUrl,
    sub_text: `${destination.travelers || 0} מטיילים`,
    countryId,
    travelers: destination.travelers || 0,
  };
  const hasOverviewColumn = quickFacts.length > 0 ||
    essentialRows.length > 0 || sourceRows.length > 0;
  const visibleRecommendations = filteredRecommendations.slice(0, visibleCount);
  const description = meaningfulDescription(destination);

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.hero}>
            {destination.heroImageUrl ? (
              <CachedImage
                source={{ uri: destination.heroImageUrl }}
                style={styles.heroImage}
                contentFit="cover"
                priority="high"
                loading="eager"
              />
            ) : (
              <View style={styles.heroFallback}>
                <MaterialCommunityIcons
                  name="map-marker-radius-outline"
                  size={72}
                  color={colors.primary}
                />
              </View>
            )}
            <View style={styles.heroShade} pointerEvents="none" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="חזרה"
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.actionButton,
                styles.backButton,
                pressed && { opacity: 0.76 },
              ]}
            >
              <Ionicons name="chevron-forward" size={24} color={colors.primary} />
            </Pressable>
            <FavoriteButton
              type="cities"
              id={cityId}
              variant="light"
              style={[styles.actionButton, styles.favoriteButton]}
              snapshotData={snapshotData}
            />
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryText}>
                <Text style={styles.cityName}>{destination.name}</Text>
                {!!destination.countryName && (
                  <Text style={styles.countryName}>{destination.countryName}</Text>
                )}
              </View>
              {destination.travelers > 0 && (
                <View style={styles.travelerPill}>
                  <Ionicons name="people-outline" size={16} color={colors.primary} />
                  <Text style={styles.travelerText}>
                    {destination.travelers} מטיילים
                  </Text>
                </View>
              )}
            </View>
            {!!description && (
              <Text style={styles.description} numberOfLines={3}>
                {description}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.main}>
          {hasOverviewColumn && (
            <View style={styles.overviewColumn}>
              {quickFacts.length > 0 && (
                <View style={styles.quickSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>במבט מהיר</Text>
                  </View>
                  <View style={styles.quickGrid}>
                    {quickFacts.map((fact) => (
                      <FactCard key={fact.id} fact={fact} styles={styles} />
                    ))}
                  </View>
                </View>
              )}
              {essentialRows.length > 0 && (
                <EssentialCard rows={essentialRows} styles={styles} />
              )}
              <SourcesDisclosure
                rows={sourceRows}
                open={sourcesOpen}
                onToggle={() => setSourcesOpen((value) => !value)}
                styles={styles}
              />
            </View>
          )}

          <View style={styles.communityColumn}>
            <View style={styles.communityHeader}>
              <Text style={styles.sectionTitle}>טיפים מהקהילה</Text>
              <Text style={styles.sectionSubtitle}>
                המלצות של מטיילים על {destination.name}
              </Text>
            </View>

            {filters.length > 1 && (
              <View
                style={styles.filters}
                accessibilityRole={Platform.OS === 'web' ? 'tablist' : undefined}
              >
                {filters.map((filter) => {
                  const active = filter.id === activeFilter;
                  return (
                    <Pressable
                      key={filter.id}
                      testID={`destination-filter-${filter.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setActiveFilter(filter.id)}
                      style={({ pressed }) => [
                        styles.filter,
                        active && styles.filterActive,
                        pressed && { opacity: 0.78 },
                      ]}
                    >
                      <Text style={[
                        styles.filterText,
                        active && styles.filterTextActive,
                      ]}>
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {visibleRecommendations.length > 0 ? (
              <View style={styles.recommendationList}>
                {visibleRecommendations.map((item) => (
                  <RecommendationPreview
                    key={item.id}
                    item={item}
                    navigation={navigation}
                    styles={styles}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={38}
                  color={colors.textLight}
                />
                <Text style={styles.emptyTitle}>
                  עדיין אין טיפים בקטגוריה הזאת
                </Text>
                <Text style={styles.emptyText}>
                  המלצות חדשות שיוסיפו מטיילים יופיעו כאן.
                </Text>
              </View>
            )}

            {visibleCount < filteredRecommendations.length && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setVisibleCount((value) => value + PAGE_SIZE)}
                style={({ pressed }) => [
                  styles.showMoreButton,
                  pressed && { opacity: 0.76 },
                ]}
              >
                <Text style={styles.showMoreText}>הצג עוד המלצות</Text>
                <Ionicons name="chevron-down" size={18} color={colors.primary} />
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
