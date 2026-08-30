import React, { useEffect, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	useWindowDimensions,
	View,
} from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import CachedImage from '../../../components/CachedImage';
import FavoriteButton from '../../../components/FavoriteButton';
import PhotoAttribution from '../../../components/PhotoAttribution';
import PreferenceContextLine from '../../../components/PreferenceContextLine';
import ReportButton from '../../moderation/components/ReportButton';
import NavigationChevron from '../../../components/NavigationChevron';
import { getTravelCategoryPresentation } from '../../../constants/travelPresentation';
import { colors } from '../../../styles';
import { getRecommendationImageUrls } from '../../../utils/mediaAssets';
import { getDestinationImageUrl } from '../../../utils/destinationImages';
import {
  destinationSourceUrlPolicy,
  getSafeExternalUrl,
  openSafeExternalUrl,
} from '../../../utils/safeExternalUrl';
import { createDestinationStyles } from '../components/destinationStyles';
import { useDestinationData } from '../hooks/useDestinationData';
import { markNoyaContentViewed } from '../../profile/services/NoyaOnboardingStorage';
import { usePersonalizationFeedback } from '../../profile/context/PersonalizationFeedbackContext';
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

function FactCard({ fact, styles, divided }) {
  const Icon = fact.iconLibrary === 'MaterialCommunityIcons'
    ? MaterialCommunityIcons
    : Ionicons;
  const iconName = fact.id === 'weather'
    ? weatherIcon(fact.conditionCode)
    : fact.icon;
  return (
    <View
      style={[styles.quickCard, divided && styles.quickCardDivider]}
      accessibilityLabel={[fact.title, fact.value, fact.detail].filter(Boolean).join(', ')}
      testID={`quick-fact-${fact.id}`}
    >
      <View style={styles.factIcon}>
        <Icon
          name={iconName}
          size={21}
          color={colors.textSecondary}
        />
      </View>
      <AppText style={styles.factTitle}>{fact.title}</AppText>
      <AppText style={styles.factValue} numberOfLines={2}>
        {fact.value}
      </AppText>
      {!!fact.detail && <AppText style={styles.factDetail}>{fact.detail}</AppText>}
    </View>
  );
}

function EssentialCard({ rows, styles }) {
  return (
    <View style={styles.neutralCard}>
      <View style={styles.sectionHeader}>
        <AppText style={styles.sectionTitle}>מידע שימושי</AppText>
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
          <AppText style={styles.essentialLabel}>{row.label}</AppText>
          <AppText style={styles.essentialValue}>{row.value}</AppText>
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
        <AppText style={styles.sourcesButtonText}>מקורות ועדכון</AppText>
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
            const policy = destinationSourceUrlPolicy(row.id);
            const safeUrl = getSafeExternalUrl(row.url, policy);
            return (
              <Pressable
                key={row.id}
                disabled={!safeUrl}
                accessibilityRole={safeUrl ? 'link' : undefined}
                accessibilityLabel={`${row.label}: ${row.value}`}
                onPress={() => safeUrl && openSafeExternalUrl(safeUrl, policy).catch(() => {
                  Alert.alert(
                    'לא ניתן לפתוח את הקישור',
                    'אפשר לנסות שוב מאוחר יותר.'
                  );
                })}
                style={({ pressed }) => [
                  styles.sourceRow,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <AppText style={styles.sourceLabel}>{row.label}</AppText>
                <AppText style={styles.sourceValue} numberOfLines={1}>
                  {[row.value, updatedAt].filter(Boolean).join(' · ')}
                </AppText>
                {!!safeUrl && (
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
  const target = { type: 'recommendation', id: item?.postId || item?.id };
  const { isHidden } = usePersonalizationFeedback();
  const imageUrl = getRecommendationImageUrls(item, 'thumb')[0] || null;
  const legacyCategory = item.category || (item.tags?.includes?.('sim_esim') ? 'SIM וגלישה' : '');
  const category = getTravelCategoryPresentation(item.categoryId, legacyCategory);
  const reasonCode = item?.personalization?.reasonCodes?.[0];
  if (isHidden(target)) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`פתיחת ההמלצה ${item.title || ''}`.trim()}
      onPress={() => navigation.navigate('RecommendationDetail', {
        postId: item.postId || item.id,
        item,
      })}
      style={({ pressed }) => [
        styles.recommendationPreview,
        pressed && { opacity: 0.78 },
      ]}
    >
      <View style={styles.recommendationChevron}>
        <NavigationChevron size={18} color={colors.primary} />
      </View>
      {imageUrl ? (
        <CachedImage
          source={{ uri: imageUrl }}
          style={styles.recommendationImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.recommendationImageFallback}>
          <MaterialIcons name={category.icon} size={24} color={colors.primary} />
        </View>
      )}
      <View style={styles.recommendationBody}>
        <View style={styles.recommendationCategory}>
          <AppText style={styles.recommendationCategoryText}>{category.label}</AppText>
        </View>
        <PreferenceContextLine
          reasonCode={reasonCode}
          personalization={item?.personalization}
          target={target}
          item={item}
        />
        <AppText style={styles.recommendationTitle} numberOfLines={1}>
          {item.title}
        </AppText>
        {!!item.description && (
          <AppText style={styles.recommendationDescription} numberOfLines={2}>
            {item.description}
          </AppText>
        )}
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

  useEffect(() => {
    markNoyaContentViewed().catch(() => {});
  }, [cityId, countryId]);

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
        <AppText style={styles.errorText}>טוענים את היעד…</AppText>
      </SafeAreaView>
    );
  }

  const destination = overview?.destination;
  if (!destination) {
    return (
      <SafeAreaView style={styles.loading} edges={['left', 'right', 'bottom']}>
        <Ionicons name="location-outline" size={38} color={colors.textLight} />
        <AppText style={styles.errorText}>{error || 'היעד לא נמצא.'}</AppText>
      </SafeAreaView>
    );
  }

  const snapshotData = {
    name: destination.name,
    thumbnail_url: getDestinationImageUrl(destination, 'thumb'),
    destinationImage: destination.destinationImage || null,
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
            {getDestinationImageUrl(destination, 'large') ? (
              <CachedImage
                source={{ uri: getDestinationImageUrl(destination, 'large') }}
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
            <PhotoAttribution destination={destination} placement="hero" />
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
            <View style={[styles.actionButton, styles.reportButton]}>
              <ReportButton
                target={{ type: 'destination', id: cityId, cityId, countryId }}
                compact
                subjectLabel="המקום"
                color={colors.primary}
              />
            </View>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryText}>
                <AppText style={styles.cityName}>{destination.name}</AppText>
                {!!destination.countryName && (
                  <AppText style={styles.countryName}>{destination.countryName}</AppText>
                )}
              </View>
              {destination.travelers > 0 && (
                <View style={styles.travelerPill}>
                  <Ionicons name="people-outline" size={16} color={colors.primary} />
                  <AppText style={styles.travelerText}>
                    {destination.travelers} מטיילים
                  </AppText>
                </View>
              )}
            </View>
            {!!description && (
              <AppText style={styles.description} numberOfLines={3}>
                {description}
              </AppText>
            )}
          </View>
        </View>

        <View style={styles.main}>
          {hasOverviewColumn && (
            <View style={styles.overviewColumn}>
              {quickFacts.length > 0 && (
                <View style={styles.quickSection}>
                  <View style={styles.sectionHeader}>
                    <AppText style={styles.sectionTitle}>במבט מהיר</AppText>
                  </View>
                  <View style={styles.quickGrid}>
                    {quickFacts.map((fact, index) => (
                      <FactCard
                        key={fact.id}
                        fact={fact}
                        styles={styles}
                        divided={index < quickFacts.length - 1}
                      />
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
              <AppText style={styles.sectionTitle}>טיפים מהקהילה</AppText>
              <AppText style={styles.sectionSubtitle}>
                המלצות של מטיילים על {destination.name}
              </AppText>
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
                      <AppText style={[
                        styles.filterText,
                        active && styles.filterTextActive,
                      ]}>
                        {filter.label}
                      </AppText>
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
                <AppText style={styles.emptyTitle}>
                  עדיין אין טיפים בקטגוריה הזאת
                </AppText>
                <AppText style={styles.emptyText}>
                  המלצות חדשות שיוסיפו מטיילים יופיעו כאן.
                </AppText>
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
                <AppText style={styles.showMoreText}>הצג עוד המלצות</AppText>
                <Ionicons name="chevron-down" size={18} color={colors.primary} />
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
