import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { common } from "../../../styles/common";
import { typography } from "../../../styles/typography";
import { tags } from "../../../styles/tags";

import FavoriteCitiesList from '../components/FavoriteCitiesList';
import FavoriteRecommendationsList from '../components/FavoriteRecommendationsList';
import FavoriteRoadTripsList from '../components/FavoriteRoadTripsList';
import FavoriteTripsList from '../components/FavoriteTripsList';

const TABS = [
	{ key: 'destinations', label: 'יעדים' },
	{ key: 'recommendations', label: 'המלצות' },
	{ key: 'trips', label: 'טיולים' },
	{ key: 'roadtrips', label: 'מסלולים' },
];

export default function FavoritesScreen({ navigation }) {
	const [activeTab, setActiveTab] = useState('destinations');

	const renderTabContent = (activeTab) => {
		switch (activeTab) {
			case 'destinations':
				return <FavoriteCitiesList />;
			case 'recommendations':
				return <FavoriteRecommendationsList />;
			case 'trips':
				/* return <FavoriteTripsList /> */
				return (
					<View style={common.containerCentered}>
						<Text style={typography.h2}>טיולים חכמים (בקרוב)</Text>
						<Text style={typography.body}>הפיצ'ר של מתכנן חכם יגיע בקרוב</Text>
					</View>
				);
			case 'roadtrips':
				/* return <FavoriteRoadTripsList /> */
				return (
					<View style={common.containerCentered}>
						<Text style={typography.h2}>מסלולים שמורים</Text>
						<Text style={typography.body}>כאן תוכל לראות את כל המסלולים ששמרת</Text>
					</View>
				);
			default:
				return null;
		}
	};

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
				{renderTabContent(activeTab)}
			</View>
		</SafeAreaView>
	);
}
