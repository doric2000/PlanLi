import { Animated, Easing, Platform, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';

import PageHeader from '../../../components/PageHeader';
import SegmentedTabs from '../../../components/SegmentedTabs';
import { useFavoriteCityIds } from '../../../hooks/useFavoriteCityIds';
import { useFavoriteRecommendationsFull } from '../../../hooks/useFavoriteRecommendationsFull';
import { useFavoriteRoadTripsFull } from '../../../hooks/useFavoriteRoadTripsFull';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import { waitForRefreshConfirmation } from '../../../utils/refreshFeedback';
import {
  getAdjacentSwipeIndex,
  resolveAdjacentSwipe,
  useHorizontalSwipeResponder,
} from '../../../navigation/horizontalSwipe';
import { favoritesSwipeStyles } from '../../../styles';
import FavoriteCitiesList from '../components/FavoriteCitiesList';
import FavoriteRecommendationsList from '../components/FavoriteRecommendationsList';
import FavoriteRoadTripsList from '../components/FavoriteRoadTripsList';
import { favoritesStyles as styles } from '../components/favoritesStyles';
import {
  useNoyaMainTabRegistration,
  useNoyaMainTabSceneReady,
  useNoyaTourTargetRegistration,
} from '../../noya/NoyaTourContext';
import { NOYA_MAIN_TARGETS } from '../../noya/NoyaTourDefinitions';

const TABS = [
  { key: 'destinations', label: 'יעדים', icon: 'place' },
  { key: 'recommendations', label: 'המלצות', icon: 'thumb-up' },
  { key: 'roadtrips', label: 'מסלולים', icon: 'map' },
];

const EXIT_DURATION_MS = 90;
const ENTER_DURATION_MS = 150;
const useNativeDriver = Platform.OS !== 'web';

export default function FavoritesScreen({ navigation }) {
  useNoyaMainTabRegistration(navigation);
  const favoritesCategoriesTourTarget = useNoyaTourTargetRegistration(NOYA_MAIN_TARGETS.favoritesCategories);
  const [activeTab, setActiveTab] = useState('destinations');
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(width, 1);
  const translateX = useRef(new Animated.Value(0)).current;
  const transitionActiveRef = useRef(false);
  const citiesListRef = useRef(null);
  const recommendationsListRef = useRef(null);
  const roadTripsListRef = useRef(null);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['destinations']));
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const citiesFull = useFavoriteCityIds({ enabled: visitedTabs.has('destinations') });
  const recsFull = useFavoriteRecommendationsFull({ enabled: visitedTabs.has('recommendations') });
  const roadFull = useFavoriteRoadTripsFull({ enabled: visitedTabs.has('roadtrips') });
  useNoyaMainTabSceneReady('Favorites', !citiesFull.loading && !refreshing && !confirming);

  useEffect(() => {
    setVisitedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const getScrollRef = useCallback(() => ({
    destinations: citiesListRef.current,
    recommendations: recommendationsListRef.current,
    roadtrips: roadTripsListRef.current,
  })[activeTab], [activeTab]);

  const refresh = useCallback(() => {
    const attempt = activeTab === 'destinations'
      ? citiesFull.reload()
      : activeTab === 'recommendations'
        ? recsFull.reload()
        : roadFull.reload();
    const networkRefresh = attempt.requested || attempt.source === 'in-flight';
    setRefreshing(networkRefresh);
    setConfirming(!networkRefresh);
    return Promise.resolve(attempt.promise)
      .catch(() => undefined)
      .then(() => (networkRefresh ? undefined : waitForRefreshConfirmation()))
      .finally(() => {
        setRefreshing(false);
        setConfirming(false);
      });
  }, [activeTab, citiesFull.reload, recsFull.reload, roadFull.reload]);

  const { onScroll } = useTabPressScrollOrRefresh({
    variant: 'flatlist', getScrollRef, onRefresh: refresh, scrollYResetKey: activeTab,
  });

  useEffect(() => () => {
    translateX.stopAnimation();
  }, [translateX]);

  const returnToCenter = useCallback(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: EXIT_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }, [translateX]);

  const transitionToIndex = useCallback((targetIndex) => {
    const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);
    if (transitionActiveRef.current) return;
    if (
      targetIndex < 0
      || targetIndex >= TABS.length
      || targetIndex === activeIndex
    ) {
      returnToCenter();
      return;
    }

    transitionActiveRef.current = true;
    const exitDirection = targetIndex < activeIndex ? -1 : 1;
    Animated.timing(translateX, {
      toValue: exitDirection * pageWidth,
      duration: EXIT_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver,
    }).start(({ finished }) => {
      if (!finished) {
        transitionActiveRef.current = false;
        translateX.setValue(0);
        return;
      }

      setActiveTab(TABS[targetIndex].key);
      translateX.setValue(-exitDirection * pageWidth);
      Animated.timing(translateX, {
        toValue: 0,
        duration: ENTER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }).start(() => {
        transitionActiveRef.current = false;
        translateX.setValue(0);
      });
    });
  }, [activeTab, pageWidth, returnToCenter, translateX]);

  const changeTab = useCallback((tabKey) => {
    transitionToIndex(TABS.findIndex((tab) => tab.key === tabKey));
  }, [transitionToIndex]);

  const handleSwipeMove = useCallback((gestureState) => {
    if (transitionActiveRef.current) return;
    const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);
    const targetIndex = getAdjacentSwipeIndex({
      activeIndex,
      itemCount: TABS.length,
      direction: gestureState.dx < 0 ? 'left' : 'right',
      swipeLeftDelta: -1,
    });
    const resistance = targetIndex === activeIndex ? 0.18 : 1;
    const offset = Math.max(-pageWidth, Math.min(pageWidth, gestureState.dx * resistance));
    translateX.setValue(offset);
  }, [activeTab, pageWidth, translateX]);

  const handleSwipeRelease = useCallback((gestureState) => {
    const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);
    transitionToIndex(resolveAdjacentSwipe({
      activeIndex,
      itemCount: TABS.length,
      gestureState,
      swipeLeftDelta: -1,
    }));
  }, [activeTab, transitionToIndex]);

  const swipeResponder = useHorizontalSwipeResponder({
    onMove: handleSwipeMove,
    onRelease: handleSwipeRelease,
    onCancel: returnToCenter,
  });

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <PageHeader
        variant="hero"
        title="מועדפים"
        testID="favorites-tab-header"
      >
          <SegmentedTabs
            rootRef={favoritesCategoriesTourTarget.ref}
            onLayout={favoritesCategoriesTourTarget.onLayout}
            tabs={TABS}
            value={activeTab}
            onChange={changeTab}
            style={styles.headerTabs}
            testID="favorites-header-tabs"
          />
      </PageHeader>
      <View style={favoritesSwipeStyles.content}>
        <Animated.View
          style={[favoritesSwipeStyles.page, { transform: [{ translateX }] }]}
          testID="favorites-swipe-surface"
          {...swipeResponder.panHandlers}
        >
          {activeTab === 'destinations' ? (
            <FavoriteCitiesList
              favorites={citiesFull.favorites}
              loading={citiesFull.loading}
              error={citiesFull.error}
              refreshing={refreshing}
              confirming={confirming}
              onRefresh={refresh}
              flatListRef={citiesListRef}
              onScroll={onScroll}
            />
          ) : null}
          {activeTab === 'recommendations' ? (
            <FavoriteRecommendationsList
              favorites={recsFull.favorites}
              loading={recsFull.loading}
              error={recsFull.error}
              refreshing={refreshing}
              confirming={confirming}
              onRefresh={refresh}
              flatListRef={recommendationsListRef}
              onScroll={onScroll}
            />
          ) : null}
          {activeTab === 'roadtrips' ? (
            <FavoriteRoadTripsList
              favorites={roadFull.favorites}
              loading={roadFull.loading}
              error={roadFull.error}
              refreshing={refreshing}
              confirming={confirming}
              onRefresh={refresh}
              flatListRef={roadTripsListRef}
              onScroll={onScroll}
            />
          ) : null}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
