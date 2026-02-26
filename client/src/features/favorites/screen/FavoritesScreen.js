import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { common } from "../../../styles/common";
import { typography } from "../../../styles/typography";
import { tags } from "../../../styles/tags";

import FavoriteCitiesList from '../components/FavoriteCitiesList';
import FavoriteRecommendationsList from '../components/FavoriteRecommendationsList';
import FavoriteRoadTripsList from '../components/FavoriteRoadTripsList';

const TABS = [
    { key: 'destinations', label: 'יעדים' },
    { key: 'recommendations', label: 'המלצות' },
    { key: 'trips', label: 'טיולים' },
    { key: 'roadtrips', label: 'מסלולים' },
];

export default function FavoritesScreen({ navigation }) {
    const [activeTab, setActiveTab] = useState('destinations');

    return (
        <SafeAreaView style={common.container}>
            {/* Header */}
            <View style={[common.staticHeaderContainer, { paddingTop: 16 }]}> 
                <Text style={[typography.h2, { textAlign: 'center', marginBottom: 4 }]}>המועדפים שלי</Text>
                <Text style={[typography.body, { textAlign: 'center', color: '#6B7280' }]}>כל מה ששמרת למסע הבא</Text>
            </View>

            {/* Tabs Row */}
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

            {/* Tab Content */}
            <View style={{ flex: 1 }}>
                <View style={{ flex: 1, display: activeTab === 'destinations' ? 'flex' : 'none' }}>
                    <FavoriteCitiesList />
                </View>
                
                <View style={{ flex: 1, display: activeTab === 'recommendations' ? 'flex' : 'none' }}>
                    <FavoriteRecommendationsList />
                </View>
                
                <View style={{ flex: 1, display: activeTab === 'roadtrips' ? 'flex' : 'none' }}>
                    <FavoriteRoadTripsList />
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