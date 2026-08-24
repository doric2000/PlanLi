import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, FlatList, TouchableOpacity, StatusBar } from 'react-native';
import AppText from "../../../components/AppText";
import AppTextInput from "../../../components/AppTextInput";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../../components/PageHeader';
import SearchFilterRow from '../../../components/SearchFilterRow';

// --- Components ---
import RecommendationsFilterModal from '../../../components/RecommendationsFilterModal';
import RecommendationCard from '../../../components/RecommendationCard';
import { CommentsModal } from '../../../components/CommentsModal';
import FabButton from '../../../components/FabButton';
import ActiveFiltersList from '../../../components/ActiveFiltersList';
import { SortMenuModal } from '../components/SortMenuModal';
import CommunityInlineMap from '../components/CommunityInlineMap';

// --- Hooks ---
import { useRecommendations } from '../../../hooks/useRecommendations';
import { useMapRecommendations } from '../../../hooks/useMapRecommendations';
import { useRecommendationById } from '../../../hooks/useRecommendationById';
import { useRecommendationFilter } from '../../../hooks/useRecommendationFilter';
import { useUserLocation } from '../../../hooks/useUserLocation';
import { useLiveUserLocation } from '../../../hooks/useLiveUserLocation';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import { useSmartProfile } from '../../../hooks/useSmartProfile';

// --- Global Styles ---
import {
  colors,
  common,
  community,
  communityScreenStyles as styles,
  discoveryFilterTriggerStyles as filterUiStyles,
  tabHeroStyles,
  TAB_HERO_OVERLAP,
  TAB_HERO_SEARCH_ICON_SIZE,
} from '../../../styles';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { CAPABILITIES } from '../../../constants/authPolicy';
import { getPlaceCoordinates, haversineDistanceKm } from '../../../utils/distance';
import {
  getFabBottomInset,
  getTabOverlayBottomInset,
  getTabSceneListPaddingBottom,
} from '../../../navigation/tabBarLayout';
import { applySmartProfileFilters, discoveryRequestFromFilters, removeDiscoveryFilter } from '../../../utils/discoveryFilters';
import { normalizeClientSmartProfile } from '../../profile/utils/preferenceSetup';
import { countDiscoveryFilters } from '../../../utils/progressiveDiscoveryFilters';
import { useRecommendationPublish } from '../publishing/RecommendationPublishContext';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import { clearPersonalizationDiscoveryCache } from '../../../services/PersonalizationService';
import { NoyaTourTarget, useNoyaMainTabRegistration } from '../../noya/NoyaTourContext';
import { NOYA_MAIN_TARGETS } from '../../noya/NoyaTourDefinitions';

function normalizeMapFocus(input) {
  const recommendationId = String(input?.recommendationId || '').trim();
  const requestId = String(input?.requestId || '').trim();
  const lat = Number(input?.coordinates?.lat);
  const lng = Number(input?.coordinates?.lng);
  if (!recommendationId || !requestId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { recommendationId, requestId, coordinates: { lat, lng } };
}

function mergeFocusedRecommendation(recommendations, focusedRecommendation, mapFocus) {
  const items = Array.isArray(recommendations) ? recommendations : [];
  if (!focusedRecommendation || !mapFocus) return items;
  const focusedId = focusedRecommendation.id || focusedRecommendation.postId;
  if (focusedId !== mapFocus.recommendationId) return items;
  const placeCoordinates = getPlaceCoordinates(focusedRecommendation.place);
  const focusedItem = {
    ...focusedRecommendation,
    id: mapFocus.recommendationId,
    postId: focusedRecommendation.postId || mapFocus.recommendationId,
    place: {
      ...(focusedRecommendation.place || {}),
      coordinates: placeCoordinates || mapFocus.coordinates,
    },
  };
  return [
    focusedItem,
    ...items.filter((item) => (item?.id || item?.postId) !== mapFocus.recommendationId),
  ];
}

export default function CommunityScreen({ navigation, route }) {
  useNoyaMainTabRegistration(navigation);
  const insets = useSafeAreaInsets();
  const { ensureCapability } = useAuthUser();
  // --- State ---
  const [sortBy, setSortBy] = useState('popularity');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapFocus, setMapFocus] = useState(null);
  const personalizationInitialized = useRef(false);
  const handledMapFocusRequest = useRef(null);

  // --- Hooks ---
  const {
    data: recommendations,
    error,
    loading,
    refreshing,
    confirming,
    refresh,
    removeRecommendation,
    setDiscoveryRequest,
  } = useRecommendations(sortBy);
  const { filteredData, filters, isFiltered, updateFilters, replaceFilters, clearFilters } = useRecommendationFilter(recommendations);
  const discoveryRequest = useMemo(() => discoveryRequestFromFilters(filters), [filters]);
  const {
    items: mapRecommendations,
    loading: mapLoading,
    error: mapError,
    truncated: mapTruncated,
    zoomInRequired,
    searchViewport,
  } = useMapRecommendations({ enabled: mapOpen, request: discoveryRequest });
  const {
    data: focusedRecommendation,
  } = useRecommendationById(mapFocus?.recommendationId || '');
  const { location: userLocation, requestLocation } = useUserLocation();
  const mapLocationState = useLiveUserLocation();
  const { smartProfile, completed: personalizationAvailable, loading: profileLoading } = useSmartProfile();
  const { completedVersionByType = {} } = useRecommendationPublish();
  const normalizedProfile = useMemo(() => normalizeClientSmartProfile(smartProfile || {}), [smartProfile]);
  const feedListRef = useRef(null);
  const recommendationPublishVersion = Number(completedVersionByType.recommendation || 0);
  const publishVersionRef = useRef(recommendationPublishVersion);

  const mapRecommendationsWithFocus = useMemo(
    () => mergeFocusedRecommendation(mapRecommendations, focusedRecommendation, mapFocus),
    [focusedRecommendation, mapFocus, mapRecommendations]
  );

  useEffect(() => {
    const nextFocus = normalizeMapFocus(route?.params?.mapFocus);
    if (!nextFocus || handledMapFocusRequest.current === nextFocus.requestId) return;
    handledMapFocusRequest.current = nextFocus.requestId;
    setMapFocus(nextFocus);
    setMapOpen(true);
    setSortMenuVisible(false);
    navigation.setParams?.({ mapFocus: undefined });
  }, [navigation, route?.params?.mapFocus]);

  useEffect(() => {
    if (profileLoading || personalizationInitialized.current) return;
    personalizationInitialized.current = true;
    if (personalizationAvailable) setSortBy('personalized');
  }, [personalizationAvailable, profileLoading]);

  useEffect(() => {
    setDiscoveryRequest(discoveryRequest);
  }, [discoveryRequest, setDiscoveryRequest]);

  useEffect(() => {
    if (publishVersionRef.current === recommendationPublishVersion) return;
    publishVersionRef.current = recommendationPublishVersion;
    clearPersonalizationDiscoveryCache('recommendations');
    refresh();
  }, [recommendationPublishVersion, refresh]);

  const { onScroll } = useTabPressScrollOrRefresh({
    variant: 'flatlist',
    scrollRef: feedListRef,
    onRefresh: refresh,
    enabled: !mapOpen && !loading,
    scrollYResetKey: mapOpen,
  });

  // --- Handlers ---
  const handleSortSelect = async (option) => {
    setSortBy(option);
    setSortMenuVisible(false);

    if (option === 'nearby') {
      const loc = await requestLocation();
      if (!loc) {
        Alert.alert(
          'מיקום לא זמין',
          'כדי למיין לפי קרבה צריך לאפשר הרשאת מיקום. אם לא ניתן לאשר, הרשימה תישאר במיון רגיל.'
        );
      }
    }
  };
  const handleOpenComments = (postId) => { setSelectedPostId(postId); setCommentsModalVisible(true); };

  const handleRemoveFilter = (type, value) => {
    replaceFilters(removeDiscoveryFilter(filters, type, value));
  };

  const sortLabel = sortBy === 'personalized'
    ? 'בשבילך'
    : sortBy === 'popularity' ? 'פופולרי' : sortBy === 'newest' ? 'חדש' : 'קרוב אליי';

  const displayData = useMemo(() => {
    if (sortBy !== 'nearby') return filteredData;
    if (!userLocation) return filteredData;

    const from = { lat: userLocation.lat, lng: userLocation.lng };

    return filteredData
      .map((item, index) => {
        const coords = getPlaceCoordinates(item?.place);
        const distanceKm = coords ? haversineDistanceKm(from, coords) : NaN;
        const normalizedDistance = Number.isFinite(distanceKm) ? distanceKm : null;
        return { item, index, distanceKm: normalizedDistance };
      })
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return a.index - b.index;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        if (a.distanceKm === b.distanceKm) return a.index - b.index;
        return a.distanceKm - b.distanceKm;
      })
        .map((x) => (x.distanceKm === null ? x.item : { ...x.item, distanceKm: x.distanceKm }));
  }, [filteredData, sortBy, userLocation]);

  const activeFilterCount = countDiscoveryFilters(filters, { includeQuery: false });

  const renderActiveFilters = () => (
    <View style={isFiltered ? styles.filtersAfterOverlappingHeader : null}>
      <ActiveFiltersList filters={filters} onRemove={handleRemoveFilter} onClear={clearFilters} />
    </View>
  );

  const renderTopArea = () => (
    <NoyaTourTarget targetId={NOYA_MAIN_TARGETS.Community}>
    <PageHeader
      variant="hero"
      title="קהילה"
      overlapNext
      style={tabHeroStyles.fixedHeader}
      testID="community-tab-header"
      renderStart={() => (
        <TouchableOpacity
          style={tabHeroStyles.iconAction}
          onPress={() => setMapOpen((previous) => {
            if (!previous) setSortMenuVisible(false);
            else setMapFocus(null);
            return !previous;
          })}
          accessibilityRole="button"
          accessibilityLabel="מפה"
          testID="community-map-toggle"
        >
          <Ionicons name={mapOpen ? "map" : "map-outline"} size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
      renderEnd={() => (
        mapOpen ? (
          <View style={[tabHeroStyles.labelAction, tabHeroStyles.mapLabelAction]} testID="map-all-recommendations-label">
            <Ionicons name="location" size={16} color="#FFFFFF" />
            <AppText
              style={[tabHeroStyles.labelText, tabHeroStyles.mapLabelText]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              כל ההמלצות באזור
            </AppText>
          </View>
        ) : (
          <TouchableOpacity
            style={tabHeroStyles.labelAction}
            onPress={() => setSortMenuVisible(true)}
            testID="community-sort-button"
          >
            <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
            <AppText style={tabHeroStyles.labelText}>{sortLabel}</AppText>
          </TouchableOpacity>
        )
      )}
    >

      <SearchFilterRow
        style={tabHeroStyles.searchRow}
        onFilterPress={() => setFilterModalVisible(true)}
        activeFilterCount={activeFilterCount}
        accessibilityLabel="סינון המלצות"
        testID="community-search-row"
        filterTestID="community-filter-button"
      >
        <View style={tabHeroStyles.searchField} testID="community-search-field">
          <Ionicons name="search" size={TAB_HERO_SEARCH_ICON_SIZE} color="rgba(255,255,255,0.62)" />
          <AppTextInput
            value={filters.query}
            onChangeText={(text) => updateFilters({ query: text })}
            placeholder="חפש המלצה"
            placeholderTextColor="rgba(255,255,255,0.48)"
            style={tabHeroStyles.searchInput}
            textAlign="right"
            autoCorrect={false}
            autoCapitalize="none"
            testID="community-search-input"
          />
          {!!filters.query && (
            <TouchableOpacity
              onPress={() => updateFilters({ query: '' })}
              style={community.destinationClearBtn}
              accessibilityRole="button"
              accessibilityLabel="חפש המלצה"
            >
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.76)" />
            </TouchableOpacity>
          )}
        </View>
      </SearchFilterRow>
    </PageHeader>
    </NoyaTourTarget>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {renderTopArea()}
      {mapOpen && (
        <>
          {renderActiveFilters()}
          <View style={community.inlineMapSection}>
            <CommunityInlineMap
              recommendations={mapRecommendationsWithFocus}
              loading={mapLoading}
              error={mapError}
              truncated={mapTruncated}
              zoomInRequired={zoomInRequired}
              onSearchViewport={searchViewport}
              locationState={mapLocationState}
              focusRequest={mapFocus}
              overlayBottomInset={getTabOverlayBottomInset(insets)}
              onOpenRecommendation={(postId) => navigation.navigate('RecommendationDetail', { postId })}
            />
          </View>
        </>
      )}

      {/* --- RECOMMENDATIONS LIST --- */}
      {!mapOpen && (
          <FlatList
            style={styles.scroll}
            ref={feedListRef}
            data={loading || refreshing || confirming ? [] : displayData}
            keyExtractor={(item) => item.id}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <RecommendationCard
                  item={item}
                  onCommentPress={handleOpenComments}
                  onDeleted={removeRecommendation}
                  variant="feed"
                  topContentInset={!isFiltered && index === 0 ? TAB_HERO_OVERLAP : 0}
              />
            )}
            contentContainerStyle={[
              styles.feedContent,
              (loading || refreshing || confirming || displayData.length === 0) && styles.feedContentEmpty,
              { paddingBottom: getTabSceneListPaddingBottom(insets) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={<CenteredRefreshControl refreshing={refreshing || confirming} onRefresh={refresh} />}
            ListHeaderComponent={renderActiveFilters()}
            ListEmptyComponent={
              loading || refreshing || confirming ? (
                <CenteredRefreshState
                  accessibilityLabel={confirming ? 'ההמלצות מעודכנות' : refreshing ? 'מרענן המלצות' : 'טוען המלצות'}
                  confirming={confirming}
                  style={styles.feedBodyState}
                  testID={confirming ? 'community-refresh-confirmation' : refreshing ? 'community-refresh-state' : 'community-loading-state'}
                />
              ) : <View style={[common.emptyState, styles.feedEmptyState, styles.feedBodyState]} testID="community-empty-state">
                <Ionicons name="images-outline" size={50} color={colors.textMuted} />
                <AppText style={common.emptyText}>{error
                  ? 'לא הצלחנו לטעון תוצאות. משכו מטה כדי לנסות שוב.'
                  : isFiltered ? 'אין תוצאות.' : 'אין המלצות עדיין.'}</AppText>
                {isFiltered && (
                  <View style={filterUiStyles.emptyActions}>
                    <TouchableOpacity style={[filterUiStyles.emptyAction, filterUiStyles.emptyActionPrimary]}
                      onPress={() => setFilterModalVisible(true)} accessibilityRole="button">
                      <AppText style={[filterUiStyles.emptyActionText, filterUiStyles.emptyActionTextPrimary]}>עריכת סינון</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity style={filterUiStyles.emptyAction} onPress={clearFilters} accessibilityRole="button">
                      <AppText style={filterUiStyles.emptyActionText}>נקה הכול</AppText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            }
          />
      )}

      {!mapOpen && (
        <FabButton
          style={{ bottom: getFabBottomInset(insets), zIndex: 10 }}
          onPress={async () => {
            if (!await ensureCapability(CAPABILITIES.ACTIVE, { name: 'AddRecommendation' })) return;
            navigation.navigate('AddRecommendation');
          }}
        />
      )}

      {/* --- FILTER MODAL --- */}
      <RecommendationsFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApply={(next) => {
          updateFilters(next);
          setFilterModalVisible(false);
        }}
        onUseProfile={(current) => applySmartProfileFilters(current, normalizedProfile)}
      />

      <CommentsModal
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        postId={selectedPostId}
      />

      {/* Sort Menu Modal */}
      <SortMenuModal
        visible={sortMenuVisible}
        onClose={() => setSortMenuVisible(false)}
        sortBy={sortBy}
        onSelect={handleSortSelect}
        personalizationAvailable={personalizationAvailable}
      />

    </SafeAreaView>
  );
}
