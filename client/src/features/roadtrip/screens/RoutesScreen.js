import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	Alert,
	FlatList,
	StatusBar,
	TouchableOpacity,
	View,
} from 'react-native';
import AppText from "../../../components/AppText";
import AppTextInput from "../../../components/AppTextInput";
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../../components/PageHeader';
import SearchFilterRow from '../../../components/SearchFilterRow';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import RoutesFilterModal from '../../../components/RoutesFilterModal';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { CAPABILITIES } from '../../../constants/authPolicy';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import { useSmartProfile } from '../../../hooks/useSmartProfile';
import {
  common,
  colors,
  routesScreenStyles as styles,
  discoveryFilterTriggerStyles as filterUiStyles,
  tabHeroStyles,
  TAB_HERO_OVERLAP,
  TAB_HERO_SEARCH_ICON_SIZE,
} from '../../../styles';
import FabButton from '../../../components/FabButton';
import { RouteCard } from '../components/RouteCard';
import { CommentsModal } from '../../../components/CommentsModal';
import ActiveRouteFiltersList from '../components/ActiveRouteFiltersList';
import { getFabBottomInset, getTabSceneListPaddingBottom } from '../../../navigation/tabBarLayout';
import { deleteContent } from '../../../services/SocialService';
import {
  clearRouteDiscoveryCache,
  loadRouteDetails,
  requestRoutes,
} from '../../../services/RouteService';
import { SortMenuModal } from '../../community/components/SortMenuModal';
import {
  applySmartProfileFilters,
  createEmptyDiscoveryFilters,
  discoveryRequestFromFilters,
  hasDiscoveryFilters,
  removeDiscoveryFilter,
} from '../../../utils/discoveryFilters';
import { normalizeClientSmartProfile } from '../../profile/utils/preferenceSetup';
import { countDiscoveryFilters } from '../../../utils/progressiveDiscoveryFilters';
import { isDiscoveryRateLimitError } from '../../../utils/discoveryErrors';
import { useContentPublish } from '../../publishing/ContentPublishContext';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import { waitForRefreshConfirmation } from '../../../utils/refreshFeedback';
import { invalidateProfileResources } from '../../../utils/profileResourceInvalidation';
import {
  useNoyaMainTabRegistration,
  useNoyaMainTabSceneReady,
  useNoyaTourTargetRegistration,
} from '../../noya/NoyaTourContext';
import { NOYA_MAIN_TARGETS } from '../../noya/NoyaTourDefinitions';
import { useOptionalRegionSelection } from '../../region/context/RegionSelectionState';
import { isRegionDiscoveryEnabled } from '../../region/regionDefinitions';
import HomeRegionPreviewChip from '../../region/components/HomeRegionPreviewChip';

const text = {
  title: 'מסלולים',
  searchPlaceholder: 'חפשו מסלול, מקום או תחום עניין...',
  noFiltered: 'אין מסלולים שמתאימים לחיפוש ולמסננים שבחרתם.',
  noRoutes: 'עדיין אין מסלולים.',
  firstRoute: 'היו הראשונים לשתף מסלול!',
};

const serverSort = (sortBy) => sortBy === 'personalized' ? 'forYou' : sortBy === 'newest' ? 'newest' : 'popular';

export default function RoutesScreen({ navigation }) {
  const { selectedRegionId } = useOptionalRegionSelection();
  const activeRegionId = isRegionDiscoveryEnabled() ? selectedRegionId : null;
  useNoyaMainTabRegistration(navigation);
  const routesSearchTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.routesSearch);
  const routesFilterTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.routesFilter);
  const routesSortTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.routesSort);
  const routesAddTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.routesAdd);
  const { ensureCapability, user: currentUser } = useAuthUser();
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [requesting, setRequesting] = useState(true);
  const [settledRequestIdentity, setSettledRequestIdentity] = useState('');
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(createEmptyDiscoveryFilters);
  const [debouncedRequest, setDebouncedRequest] = useState(discoveryRequestFromFilters(filters, { surface: 'routes' }));
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [sortBy, setSortBy] = useState('popularity');
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const personalizationInitialized = useRef(false);
  const requestSerial = useRef(0);
  const routeActionRef = useRef('');
  const principal = currentUser?.uid || 'guest';
  const routesListRef = useRef(null);
  const { smartProfile, completed: personalizationAvailable, loading: profileLoading } = useSmartProfile();
  const normalizedProfile = useMemo(() => normalizeClientSmartProfile(smartProfile || {}), [smartProfile]);
  const { completedVersionByType = {} } = useContentPublish();
  const routePublishVersion = Number(completedVersionByType.route || 0);
  const completedRouteVersionRef = useRef(routePublishVersion);

  useEffect(() => {
    requestSerial.current += 1;
    setRoutes([]);
    setError(null);
    setLoading(true);
    setRefreshing(false);
    setConfirming(false);
    setRequesting(true);
    setSettledRequestIdentity('');
  }, [activeRegionId, principal]);

  useEffect(() => {
    if (profileLoading || personalizationInitialized.current) return;
    personalizationInitialized.current = true;
    if (personalizationAvailable) setSortBy('personalized');
  }, [personalizationAvailable, profileLoading]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRequest(discoveryRequestFromFilters(filters, { surface: 'routes' })), 350);
    return () => clearTimeout(timer);
  }, [filters]);

  const requestKey = JSON.stringify(debouncedRequest);
  const requestIdentity = JSON.stringify([principal, activeRegionId, sortBy, requestKey]);
  const personalizationSortReady = !profileLoading
    && (!personalizationAvailable || sortBy === 'personalized');
  const requestSettled = !requesting && settledRequestIdentity === requestIdentity;
  useNoyaMainTabSceneReady(
    'Routes',
    personalizationSortReady && requestSettled && !loading && !refreshing && !confirming,
  );
  const fetchRoutes = useCallback(async ({ showLoader = true, refreshFeedback = false } = {}) => {
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    const requestedIdentity = requestIdentity;
    setRequesting(true);
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const attempt = requestRoutes({ ...debouncedRequest, ...(activeRegionId ? { regionId: activeRegionId } : {}), sort: serverSort(sortBy), limit: 30 });
      if (refreshFeedback) {
        const networkPending = attempt.requested || attempt.source === 'in-flight';
        setRefreshing(networkPending);
        setConfirming(!networkPending);
      }
      const response = await attempt.promise;
      if (refreshFeedback && !attempt.requested && attempt.source !== 'in-flight') {
        await waitForRefreshConfirmation();
      }
      if (requestSerial.current !== serial) return;
      setRoutes(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      if (requestSerial.current !== serial) return;
      if (isDiscoveryRateLimitError(error)) {
        console.info('discovery_request_throttled', { surface: 'routes' });
      } else {
        console.error('Failed to load routes', error);
      }
      setError(error);
    } finally {
      if (requestSerial.current !== serial) return;
      setSettledRequestIdentity(requestedIdentity);
      setRequesting(false);
      setLoading(false);
      setRefreshing(false);
      setConfirming(false);
    }
  }, [activeRegionId, requestIdentity, requestKey, sortBy, principal]);

  useFocusEffect(useCallback(() => {
    fetchRoutes({ showLoader: routes.length === 0 });
  }, [fetchRoutes]));

  useEffect(() => {
    if (completedRouteVersionRef.current === routePublishVersion) return;
    completedRouteVersionRef.current = routePublishVersion;
    clearRouteDiscoveryCache();
    fetchRoutes({ showLoader: false });
  }, [routePublishVersion, fetchRoutes]);

  const refresh = useCallback(() => {
    return fetchRoutes({ showLoader: false, refreshFeedback: true });
  }, [fetchRoutes]);
  const { onScroll } = useTabPressScrollOrRefresh({
    variant: 'flatlist',
    scrollRef: routesListRef,
    onRefresh: refresh,
    enabled: !loading,
  });

  const handleDelete = (routeId) => {
    Alert.alert('מחיקת מסלול', 'בטוחים שברצונכם למחוק את המסלול?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: async () => {
        const actionKey = `delete:${routeId}`;
        if (routeActionRef.current) return;
        routeActionRef.current = actionKey;
        try {
          await deleteContent({ type: 'route', id: routeId });
          requestSerial.current += 1;
          clearRouteDiscoveryCache();
          if (currentUser?.uid) invalidateProfileResources(currentUser.uid);
          setLoading(false);
          setRefreshing(false);
          setConfirming(false);
          setRequesting(false);
          setSettledRequestIdentity(requestIdentity);
          setRoutes((current) => current.filter((item) => item.id !== routeId));
        } catch (error) {
          console.error('Error deleting route:', error);
          Alert.alert('שגיאה', 'לא הצלחנו למחוק את המסלול.');
        } finally {
          if (routeActionRef.current === actionKey) routeActionRef.current = '';
        }
      } },
    ]);
  };
  const handleEdit = async (route) => {
    const actionKey = `edit:${route.id}`;
    if (routeActionRef.current) return;
    routeActionRef.current = actionKey;
    try {
      const routeToEdit = await loadRouteDetails(route.id);
      if (!routeToEdit) throw new Error('Route is unavailable.');
      navigation.navigate('AddRoutesScreen', { routeToEdit });
    } catch (error) {
      console.warn('route_edit_open_failed', { code: error?.code || 'unknown' });
      Alert.alert('לא הצלחנו לפתוח את העריכה', 'המסלול לא השתנה. אפשר לנסות שוב בעוד רגע.');
    } finally {
      if (routeActionRef.current === actionKey) routeActionRef.current = '';
    }
  };
  const openRoute = async (route) => {
    const actionKey = `open:${route.id}`;
    if (routeActionRef.current) return;
    routeActionRef.current = actionKey;
    try {
      const routeData = await loadRouteDetails(route.id);
      if (!routeData) throw new Error('Route is unavailable.');
      navigation.navigate('RouteDetail', { routeData });
    } catch (error) {
      console.warn('route_detail_open_failed', { code: error?.code || 'unknown' });
      Alert.alert('לא הצלחנו לפתוח את המסלול', 'אפשר לנסות שוב בעוד רגע.');
    } finally {
      if (routeActionRef.current === actionKey) routeActionRef.current = '';
    }
  };
  const isFiltered = hasDiscoveryFilters(filters);
  const activeFilterCount = countDiscoveryFilters(filters, { includeQuery: false });
  const sortLabel = sortBy === 'personalized' ? 'בשבילך' : sortBy === 'newest' ? 'חדש' : 'פופולרי';

  const openCreateRoute = async () => {
    if (!await ensureCapability(CAPABILITIES.ACTIVE, { name: 'AddRoutesScreen' })) return;
    navigation.navigate('AddRoutesScreen');
  };

  const renderTopArea = () => (
    <PageHeader
      variant="hero"
      title={text.title}
      overlapNext
      style={tabHeroStyles.fixedHeader}
      testID="routes-tab-header"
      renderEnd={() => (
        <TouchableOpacity
          accessibilityLabel="מיון מסלולים"
          collapsable={false}
          onLayout={routesSortTourTarget.onLayout}
          onPress={() => setSortVisible(true)}
          ref={routesSortTourTarget.ref}
          style={tabHeroStyles.labelAction}
          testID="routes-sort-button"
        >
          <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
          <AppText style={tabHeroStyles.labelText}>{sortLabel}</AppText>
        </TouchableOpacity>
      )}
    >
      <SearchFilterRow
        style={tabHeroStyles.searchRow}
        searchTargetRef={routesSearchTourTarget.ref}
        searchTargetTestID="routes-search-tour-target"
        onSearchTargetLayout={routesSearchTourTarget.onLayout}
        filterTargetRef={routesFilterTourTarget.ref}
        onFilterTargetLayout={routesFilterTourTarget.onLayout}
        onFilterPress={() => setFilterVisible(true)}
        activeFilterCount={activeFilterCount}
        accessibilityLabel="סינון מסלולים"
        testID="routes-search-row"
        filterTestID="routes-filter-button"
      >
        <View style={tabHeroStyles.searchField} testID="routes-search-field">
          <Ionicons name="search" size={TAB_HERO_SEARCH_ICON_SIZE} color="rgba(255,255,255,0.62)" />
          <AppTextInput value={filters.query} onChangeText={(query) => setFilters((current) => ({ ...current, query }))}
            placeholder={text.searchPlaceholder} placeholderTextColor="rgba(255,255,255,0.48)"
            style={tabHeroStyles.searchInput} textAlign="right" autoCorrect={false} autoCapitalize="none"
            testID="routes-search-input" />
          {!!filters.query && (
            <TouchableOpacity onPress={() => setFilters((current) => ({ ...current, query: '' }))}
              style={styles.destinationClearBtn} accessibilityLabel="נקה חיפוש">
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.76)" />
            </TouchableOpacity>
          )}
        </View>
      </SearchFilterRow>
    </PageHeader>
  );

  const renderActiveFilters = () => (
    <View style={isFiltered ? styles.filtersAfterOverlappingHeader : null}>
      <ActiveRouteFiltersList filters={filters}
        onRemove={(field, value) => setFilters((current) => removeDiscoveryFilter(current, field, value))}
        onClear={() => setFilters(createEmptyDiscoveryFilters())} />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {renderTopArea()}
      {isRegionDiscoveryEnabled() ? <HomeRegionPreviewChip regionId={selectedRegionId} onPress={() => navigation.navigate('RegionSelector', { source: 'routes-change' })} /> : null}
      <FlatList style={styles.scroll} ref={routesListRef} data={loading || refreshing || confirming ? [] : routes} keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.feedContent,
            (loading || refreshing || confirming || routes.length === 0) && styles.feedContentEmpty,
            { paddingBottom: getTabSceneListPaddingBottom(insets) },
          ]}
          initialNumToRender={3} maxToRenderPerBatch={3} windowSize={5} onScroll={onScroll} scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <RouteCard item={item} onPress={() => openRoute(item)} isOwner={currentUser && item.ownerId === currentUser.uid}
              onEdit={() => handleEdit(item)} onDelete={() => handleDelete(item.id)}
              onCommentPress={(routeId) => { setSelectedRouteId(routeId); setCommentsModalVisible(true); }} variant="feed"
              topContentInset={!isFiltered && index === 0 ? TAB_HERO_OVERLAP : 0} />
          )}
          refreshControl={<CenteredRefreshControl refreshing={refreshing || confirming} onRefresh={refresh} />}
          ListHeaderComponent={renderActiveFilters()}
          ListEmptyComponent={loading || refreshing || confirming ? <CenteredRefreshState
            accessibilityLabel={confirming ? 'המסלולים מעודכנים' : refreshing ? 'מרענן מסלולים' : 'טוען מסלולים'}
            confirming={confirming}
            style={styles.feedBodyState}
            testID={confirming ? 'routes-refresh-confirmation' : refreshing ? 'routes-refresh-state' : 'routes-loading-state'}
          /> : <View style={[common.emptyState, styles.feedEmptyState, styles.feedBodyState]} testID="routes-empty-state"><Ionicons name="trail-sign-outline" size={50} color={colors.textMuted} />
            <AppText style={common.emptyText}>{error
              ? 'לא הצלחנו לטעון מסלולים. משכו מטה כדי לנסות שוב.'
              : isFiltered ? text.noFiltered : text.noRoutes}</AppText>
            {!isFiltered && <AppText style={common.emptySubText}>{text.firstRoute}</AppText>}
            {isFiltered && (
              <View style={filterUiStyles.emptyActions}>
                <TouchableOpacity style={[filterUiStyles.emptyAction, filterUiStyles.emptyActionPrimary]}
                  onPress={() => setFilterVisible(true)} accessibilityRole="button">
                  <AppText style={[filterUiStyles.emptyActionText, filterUiStyles.emptyActionTextPrimary]}>עריכת סינון</AppText>
                </TouchableOpacity>
                <TouchableOpacity style={filterUiStyles.emptyAction}
                  onPress={() => setFilters(createEmptyDiscoveryFilters())} accessibilityRole="button">
                  <AppText style={filterUiStyles.emptyActionText}>נקה הכול</AppText>
                </TouchableOpacity>
              </View>
            )}
          </View>} showsVerticalScrollIndicator={false} />
      <FabButton
        accessibilityLabel="הוספת מסלול"
        onLayout={routesAddTourTarget.onLayout}
        onPress={openCreateRoute}
        rootRef={routesAddTourTarget.ref}
        style={{ bottom: getFabBottomInset(insets), zIndex: 10 }}
        testID="routes-add-button"
      />
      <RoutesFilterModal visible={filterVisible} onClose={() => setFilterVisible(false)} filters={filters}
        onApply={(next) => { setFilters({ ...createEmptyDiscoveryFilters(), ...next }); setFilterVisible(false); }}
        onUseProfile={(current) => applySmartProfileFilters(current, normalizedProfile, { surface: 'routes' })} />
      <SortMenuModal visible={sortVisible} onClose={() => setSortVisible(false)} sortBy={sortBy}
        onSelect={(value) => { setSortBy(value); setSortVisible(false); }}
        personalizationAvailable={personalizationAvailable} includeNearby={false} />
      <CommentsModal visible={commentsModalVisible} onClose={() => setCommentsModalVisible(false)}
        postId={selectedRouteId} collectionName="routes" />
    </SafeAreaView>
  );
}
