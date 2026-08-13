import { Animated, Easing, FlatList, Platform, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';

import EmptyState from '../../../components/EmptyState';
import PageHeader from '../../../components/PageHeader';
import SegmentedTabs from '../../../components/SegmentedTabs';
import { useFavoriteRecommendationsFull } from '../../../hooks/useFavoriteRecommendationsFull';
import { useFavoriteRoadTripsFull } from '../../../hooks/useFavoriteRoadTripsFull';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
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

const TABS = [
  { key: 'destinations', label: 'יעדים', icon: 'place' },
  { key: 'recommendations', label: 'המלצות', icon: 'thumb-up' },
  { key: 'trips', label: 'טיולים', icon: 'luggage' },
  { key: 'roadtrips', label: 'מסלולים', icon: 'map' },
];

const EXIT_DURATION_MS = 90;
const ENTER_DURATION_MS = 150;
const useNativeDriver = Platform.OS !== 'web';

export default function FavoritesScreen() {
  const [activeTab, setActiveTab] = useState('destinations');
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(width, 1);
  const translateX = useRef(new Animated.Value(0)).current;
  const transitionActiveRef = useRef(false);
  const citiesListRef = useRef(null);
  const recommendationsListRef = useRef(null);
  const roadTripsListRef = useRef(null);
  const tripsListRef = useRef(null);
  const recsFull = useFavoriteRecommendationsFull({ enabled: activeTab === 'recommendations' });
  const roadFull = useFavoriteRoadTripsFull({ enabled: activeTab === 'roadtrips' });

  const getScrollRef = useCallback(() => ({
    destinations: citiesListRef.current,
    recommendations: recommendationsListRef.current,
    roadtrips: roadTripsListRef.current,
    trips: tripsListRef.current,
  })[activeTab], [activeTab]);

  const refresh = useCallback(() => {
    if (activeTab === 'recommendations') recsFull.reload();
    if (activeTab === 'roadtrips') roadFull.reload();
  }, [activeTab, recsFull.reload, roadFull.reload]);

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
    enabled: !transitionActiveRef.current,
    onMove: handleSwipeMove,
    onRelease: handleSwipeRelease,
    onCancel: returnToCenter,
  });

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <PageHeader variant="hero" title="מועדפים" testID="favorites-tab-header">
        <SegmentedTabs
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
          {activeTab === 'destinations' ? <FavoriteCitiesList flatListRef={citiesListRef} onScroll={onScroll} /> : null}
          {activeTab === 'recommendations' ? (
            <FavoriteRecommendationsList favorites={recsFull.favorites} loading={recsFull.loading} flatListRef={recommendationsListRef} onScroll={onScroll} />
          ) : null}
          {activeTab === 'roadtrips' ? (
            <FavoriteRoadTripsList favorites={roadFull.favorites} loading={roadFull.loading} flatListRef={roadTripsListRef} onScroll={onScroll} />
          ) : null}
          {activeTab === 'trips' ? (
            <FlatList
              ref={tripsListRef}
              data={[]}
              onScroll={onScroll}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<EmptyState icon="map" title="טיולים חכמים — בקרוב" message="מתכנן הטיולים החכם יופיע כאן כשיהיה מוכן." />}
            />
          ) : null}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
