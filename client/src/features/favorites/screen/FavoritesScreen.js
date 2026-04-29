import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useRef, useState } from 'react';
import { common } from "../../../styles/common";
import { typography } from "../../../styles/typography";
import { tags } from "../../../styles/tags";
import { useFavoriteRecommendationsFull } from '../../../hooks/useFavoriteRecommendationsFull';
import { useFavoriteRoadTripsFull } from '../../../hooks/useFavoriteRoadTripsFull';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';

import FavoriteCitiesList from '../components/FavoriteCitiesList';
import FavoriteRecommendationsList from '../components/FavoriteRecommendationsList';
import FavoriteRoadTripsList from '../components/FavoriteRoadTripsList';

const TABS = [
    { key: 'destinations', label: 'יעדים' },
    { key: 'recommendations', label: 'המלצות' },
    { key: 'trips', label: 'טיולים' },
    { key: 'roadtrips', label: 'מסלולים' },
];

export default function FavoritesScreen() {
    const [activeTab, setActiveTab] = useState('destinations');

    const citiesListRef = useRef(null);
    const recommendationsListRef = useRef(null);
    const roadTripsListRef = useRef(null);

    const recsFull = useFavoriteRecommendationsFull();
    const roadFull = useFavoriteRoadTripsFull();

    const getScrollRef = useCallback(() => {
        switch (activeTab) {
            case 'destinations':
                return citiesListRef.current;
            case 'recommendations':
                return recommendationsListRef.current;
            case 'roadtrips':
                return roadTripsListRef.current;
            default:
                return null;
        }
    }, [activeTab]);

    const favoritesTabRefresh = useCallback(() => {
        switch (activeTab) {
            case 'destinations':
                // Firestore onSnapshot on cities favorites — live updates; no refetch API.
                break;
            case 'recommendations':
                recsFull.reload();
                break;
            case 'roadtrips':
                roadFull.reload();
                break;
            default:
                break;
        }
    }, [activeTab, recsFull.reload, roadFull.reload]);

    const { onScroll: favoritesTabOnScroll } = useTabPressScrollOrRefresh({
        variant: 'flatlist',
        getScrollRef,
        onRefresh: favoritesTabRefresh,
        scrollYResetKey: activeTab,
    });

    return (
        <SafeAreaView style={common.container}>
            <View style={[common.staticHeaderContainer, { paddingTop: 16 }]}> 
                <Text style={[typography.h2, { textAlign: 'center', marginBottom: 4 }]}>המועדפים שלי</Text>
                <Text style={[typography.body, { textAlign: 'center', color: '#6B7280' }]}>כל מה ששמרת למסע הבא</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12 }}>
                {TABS.map(tab => {
                    const selected = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[
                                tags.chip,
                                { marginHorizontal: 4 },
                                selected && tags.chipSelected
                            ]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Text style={[tags.chipText, selected && tags.chipTextSelected]}>{tab.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={{ flex: 1 }}>
                <View style={{ flex: 1, display: activeTab === 'destinations' ? 'flex' : 'none' }}>
                    <FavoriteCitiesList
                        flatListRef={citiesListRef}
                        onScroll={activeTab === 'destinations' ? favoritesTabOnScroll : undefined}
                    />
                </View>
                
                <View style={{ flex: 1, display: activeTab === 'recommendations' ? 'flex' : 'none' }}>
                    <FavoriteRecommendationsList
                        favorites={recsFull.favorites}
                        loading={recsFull.loading}
                        flatListRef={recommendationsListRef}
                        onScroll={activeTab === 'recommendations' ? favoritesTabOnScroll : undefined}
                    />
                </View>
                
                <View style={{ flex: 1, display: activeTab === 'roadtrips' ? 'flex' : 'none' }}>
                    <FavoriteRoadTripsList
                        favorites={roadFull.favorites}
                        loading={roadFull.loading}
                        flatListRef={roadTripsListRef}
                        onScroll={activeTab === 'roadtrips' ? favoritesTabOnScroll : undefined}
                    />
                </View>
                
                <View style={{ flex: 1, display: activeTab === 'trips' ? 'flex' : 'none' }}>
                    <View style={common.containerCentered}>
                        <Text style={typography.h2}>טיולים חכמים (בקרוב)</Text>
                        <Text style={typography.body}>הפיצ'ר של מתכנן חכם יגיע בקרוב</Text>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}
