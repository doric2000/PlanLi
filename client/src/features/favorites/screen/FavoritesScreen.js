import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useRef, useState } from 'react';

import EmptyState from '../../../components/EmptyState';
import PageHeader from '../../../components/PageHeader';
import SegmentedTabs from '../../../components/SegmentedTabs';
import { useFavoriteRecommendationsFull } from '../../../hooks/useFavoriteRecommendationsFull';
import { useFavoriteRoadTripsFull } from '../../../hooks/useFavoriteRoadTripsFull';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
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

export default function FavoritesScreen() {
  const [activeTab, setActiveTab] = useState('destinations');
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

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <PageHeader variant="hero" title="מועדפים" testID="favorites-tab-header">
        <SegmentedTabs
          tabs={TABS}
          value={activeTab}
          onChange={setActiveTab}
          style={styles.headerTabs}
          testID="favorites-header-tabs"
        />
      </PageHeader>
      <View style={{ flex: 1 }}>
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
      </View>
    </SafeAreaView>
  );
}
