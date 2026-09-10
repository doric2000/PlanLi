import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	Alert,
	FlatList,
	StatusBar,
	View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import CommunityHeader from '../../community/components/CommunityHeader';
import CommunityFeedState from '../../community/components/CommunityFeedState';
import { communityDiscoveryStyles as discoveryStyles } from '../../../styles/communityDiscovery';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import RoutesFilterModal from '../../../components/RoutesFilterModal';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import { useSmartProfile } from '../../../hooks/useSmartProfile';
import {
  routesScreenStyles as styles,
} from '../../../styles';
import { RouteCard } from '../components/RouteCard';
import { CommentsModal } from '../../../components/CommentsModal';
import ActiveRouteFiltersList from '../components/ActiveRouteFiltersList';
import { getTabOverlayBottomInset } from '../../../navigation/tabBarLayout';
import { deleteContent } from '../../../services/SocialService';
import { contentDeletionFailureMessage } from '../../../utils/contentDeletionError';
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

const serverSort = (sortBy) => sortBy === 'personalized' ? 'forYou' : sortBy === 'newest' ? 'newest' : 'popular';

export default function RoutesScreen({ navigation }) {
  const { selectedRegionId, selectedMode } = useOptionalRegionSelection();
  const activeRegionId = isRegionDiscoveryEnabled() ? selectedRegionId : null;
  useNoyaMainTabRegistration(navigation);
  const routesSearchTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.routesSearch);
  const routesFilterTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.routesFilter);
  const routesSortTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.routesSort);
  const { user: currentUser } = useAuthUser();
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
  const previousScope = useRef(selectedRegionId);
  useEffect(() => {
    if (previousScope.current === selectedRegionId) return;
    previousScope.current = selectedRegionId;
    if (isRegionDiscoveryEnabled()) setFilters((previous) => ({ ...previous, destinations: [] }));
  }, [selectedRegionId]);
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
          Alert.alert('שגיאה', contentDeletionFailureMessage(error, 'route'));
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

  const renderTopArea = () => (
    <CommunityHeader navigation={navigation} mode="Routes" filters={filters}
      regionId={selectedRegionId} regionMode={selectedMode}
      onSubmit={(query) => setFilters((current) => ({ ...current, query }))}
      onDestinationsChange={(destinations) => setFilters((current) => ({ ...current, destinations }))}
      onFilter={() => setFilterVisible(true)}
      onSort={() => setSortVisible(true)} sortLabel={sortLabel} activeFilterCount={activeFilterCount}

      targets={{ search: routesSearchTourTarget, filter: routesFilterTourTarget, sort: routesSortTourTarget }}
    />
  );

  const renderActiveFilters = () => (
    <View>
      <ActiveRouteFiltersList compact filters={filters}
        onRemove={(field, value) => setFilters((current) => removeDiscoveryFilter(current, field, value))}
        onClear={() => setFilters((current) => ({ ...createEmptyDiscoveryFilters(), query: current.query }))} />
    </View>
  );

  return (
    <SafeAreaView style={discoveryStyles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {renderTopArea()}
      {renderActiveFilters()}
      <FlatList style={[styles.scroll, discoveryStyles.screen]} ref={routesListRef} data={loading || refreshing || confirming ? [] : routes} keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.feedContent, discoveryStyles.feed,
            (loading || refreshing || confirming || routes.length === 0) && styles.feedContentEmpty,
            { paddingBottom: getTabOverlayBottomInset(insets, 16) },
          ]}
          initialNumToRender={3} maxToRenderPerBatch={3} windowSize={5} onScroll={onScroll} scrollEventThrottle={16}
          renderItem={({ item }) => (
            <RouteCard item={item} onPress={() => openRoute(item)} isOwner={currentUser && item.ownerId === currentUser.uid}
              onEdit={() => handleEdit(item)} onDelete={() => handleDelete(item.id)}
              onCommentPress={(routeId) => { setSelectedRouteId(routeId); setCommentsModalVisible(true); }} variant="community" />
          )}
          refreshControl={<CenteredRefreshControl refreshing={refreshing || confirming} onRefresh={refresh} />}

          ListEmptyComponent={loading || refreshing || confirming ? <CenteredRefreshState
            accessibilityLabel={confirming ? 'המסלולים מעודכנים' : refreshing ? 'מרענן מסלולים' : 'טוען מסלולים'}
            confirming={confirming}
            style={styles.feedBodyState}
            testID={confirming ? 'routes-refresh-confirmation' : refreshing ? 'routes-refresh-state' : 'routes-loading-state'}
          /> : <CommunityFeedState error={error} filtered={isFiltered} routes onRetry={refresh}
            onFilter={() => setFilterVisible(true)} onClear={() => setFilters(createEmptyDiscoveryFilters())} />}
          showsVerticalScrollIndicator={false} />
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
