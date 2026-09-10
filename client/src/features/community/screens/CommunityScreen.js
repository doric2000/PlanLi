import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, FlatList, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CommunityHeader from '../components/CommunityHeader';
import CommunityFeedState from '../components/CommunityFeedState';
import { communityDiscoveryStyles as discoveryStyles } from '../../../styles/communityDiscovery';

// --- Components ---
import RecommendationsFilterModal from '../../../components/RecommendationsFilterModal';
import RecommendationCard from '../../../components/RecommendationCard';
import { CommentsModal } from '../../../components/CommentsModal';
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
  community,
  communityScreenStyles as styles,
} from '../../../styles';
import { getPlaceCoordinates, haversineDistanceKm } from '../../../utils/distance';
import {
  getTabOverlayBottomInset,
} from '../../../navigation/tabBarLayout';
import { applySmartProfileFilters, createEmptyDiscoveryFilters, discoveryRequestFromFilters, removeDiscoveryFilter } from '../../../utils/discoveryFilters';
import { normalizeClientSmartProfile } from '../../profile/utils/preferenceSetup';
import { countDiscoveryFilters } from '../../../utils/progressiveDiscoveryFilters';
import { useRecommendationPublish } from '../publishing/RecommendationPublishContext';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import { clearPersonalizationDiscoveryCache } from '../../../services/PersonalizationService';
import {
  useNoyaMainTabRegistration,
  useNoyaMainTabSceneReady,
  useNoyaTour,
  useNoyaTourTargetRegistration,
} from '../../noya/NoyaTourContext';
import { NOYA_MAIN_TARGETS } from '../../noya/NoyaTourDefinitions';
import { useOptionalRegionSelection } from '../../region/context/RegionSelectionState';
import { isRegionDiscoveryEnabled } from '../../region/regionDefinitions';

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
  const { selectedRegionId, selectedMode } = useOptionalRegionSelection();
  useNoyaMainTabRegistration(navigation);
  const { activeDefinition, pendingMainDefinition } = useNoyaTour();
  const communitySearchTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.communitySearch);
  const communityFilterTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.communityFilter);
  const communitySortTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.communitySort);
  const communityMapTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.communityMap);
  const insets = useSafeAreaInsets();
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

  useEffect(() => {
    if (!isRegionDiscoveryEnabled()) return;
    setMapOpen(false);
    setMapFocus(null);
  }, [selectedRegionId]);

  // --- Hooks ---
  const {
    data: recommendations,
    error,
    loading,
    refreshing,
    confirming,
    requestSettled,
    refresh,
    removeRecommendation,
    setDiscoveryRequest,
  } = useRecommendations(sortBy);
  const { filteredData, filters, isFiltered, updateFilters, replaceFilters, clearFilters } = useRecommendationFilter(recommendations);
  const previousScope = useRef(selectedRegionId);
  useEffect(() => {
    if (previousScope.current === selectedRegionId) return;
    previousScope.current = selectedRegionId;
    if (isRegionDiscoveryEnabled()) updateFilters({ destinations: [] });
  }, [selectedRegionId]);
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
  const personalizationSortReady = !profileLoading
    && (!personalizationAvailable || sortBy === 'personalized');
  useNoyaMainTabSceneReady(
    'Community',
    personalizationSortReady && requestSettled && !loading && !refreshing && !confirming,
  );
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

  const communityTourListRequired = activeDefinition?.tabName === 'Community'
    || pendingMainDefinition?.tabName === 'Community';
  useEffect(() => {
    if (!communityTourListRequired) return;
    setMapOpen(false);
    setSortMenuVisible(false);
  }, [communityTourListRequired, route?.params?.mapFocus]);

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
    <View>
      <ActiveFiltersList compact filters={filters} onRemove={handleRemoveFilter} onClear={() => replaceFilters({ ...createEmptyDiscoveryFilters(), query: filters.query })} />
    </View>
  );

  const renderTopArea = () => (
    <CommunityHeader navigation={navigation} mode="CommunityFeed" filters={filters}
      regionId={selectedRegionId} regionMode={selectedMode}
      onSubmit={(query) => updateFilters({ query })}
      onDestinationsChange={(destinations) => updateFilters({ destinations })}
      onFilter={() => setFilterModalVisible(true)}
      onSort={() => setSortMenuVisible(true)} sortLabel={sortLabel} activeFilterCount={activeFilterCount}
      mapOpen={mapOpen} onMapToggle={() => { setMapOpen((previous) => !previous); setSortMenuVisible(false); setMapFocus(null); }}
      targets={{ search: communitySearchTourTarget, filter: communityFilterTourTarget, sort: communitySortTourTarget, map: communityMapTourTarget }}
    />
  );

  return (
    <SafeAreaView style={discoveryStyles.screen} edges={["left", "right"]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {renderTopArea()}
      {renderActiveFilters()}
      {mapOpen && (
        <>
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
      <View style={mapOpen ? discoveryStyles.hiddenFeed : { flex: 1 }}>
          <FlatList
            style={[styles.scroll, discoveryStyles.screen]}
            ref={feedListRef}
            data={loading || refreshing || confirming ? [] : displayData}
            keyExtractor={(item) => item.id}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <RecommendationCard
                  item={item}
                  onCommentPress={handleOpenComments}
                  onDeleted={removeRecommendation}
                  variant="community"
              />
            )}
            contentContainerStyle={[
              styles.feedContent, discoveryStyles.feed,
              (loading || refreshing || confirming || displayData.length === 0) && styles.feedContentEmpty,
              { paddingBottom: getTabOverlayBottomInset(insets, 16) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={<CenteredRefreshControl refreshing={refreshing || confirming} onRefresh={refresh} />}

            ListEmptyComponent={
              loading || refreshing || confirming ? (
                <CenteredRefreshState
                  accessibilityLabel={confirming ? 'ההמלצות מעודכנות' : refreshing ? 'מרענן המלצות' : 'טוען המלצות'}
                  confirming={confirming}
                  style={styles.feedBodyState}
                  testID={confirming ? 'community-refresh-confirmation' : refreshing ? 'community-refresh-state' : 'community-loading-state'}
                />
              ) : <CommunityFeedState error={error} filtered={isFiltered} onRetry={refresh}
                onFilter={() => setFilterModalVisible(true)} onClear={clearFilters} />
            }
          />
      </View>

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
