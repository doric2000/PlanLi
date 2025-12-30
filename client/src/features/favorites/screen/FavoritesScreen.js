import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { common } from "../../../styles/common";
import { typography } from "../../../styles/typography";
import { buttons } from "../../../styles/buttons";
import { tags } from "../../../styles/tags";
import { FAVORITE_CARD_WIDTH } from '../../../styles/cards';

import { useFavoriteRecommendationsFull } from '../../../hooks/useFavoriteRecommendationsFull';
import RecommendationCard from '../../../components/RecommendationCard';
import CityCard from '../../../components/CityCard';
import { useFavoriteCityIds } from '../../../hooks/useFavoriteCityIds';

const TABS = [
	{ key: 'destinations', label: 'יעדים' },
	{ key: 'recommendations', label: 'המלצות' },
	{ key: 'trips', label: 'טיולים' },
	{ key: 'roadtrips', label: 'מסלולים' },
];

function FavoriteCitiesList({ navigation }) {
	const { favorites, loading } = useFavoriteCityIds();
	if (loading) {
		return (
			<View style={common.containerCentered}>
				<ActivityIndicator size="large" color="#49bc8e" />
			</View>
		);
	}
	if (!favorites.length) {
		return (
			<View style={common.containerCentered}>
				<Text style={typography.h2}>היעדים המועדפים שלך</Text>
				<Text style={typography.body}>לא שמרת יעדים עדיין</Text>
			</View>
		);
	}
	return (
		<FlatList
			data={favorites}
			keyExtractor={item => item.id}
			renderItem={({ item }) => (
				<CityCard
					city={{
						id: item.id,
						name: item.name || item.title || 'Unknown',
						countryId: item.countryId,
						imageUrl: item.thumbnail_url,
						rating: item.rating,
						travelers: item.travelers
					}}
					onPress={() => navigation.navigate('LandingPage', {
						cityId: item.id,
						countryId: item.countryId
					})}
					style={{ width: FAVORITE_CARD_WIDTH, maxWidth: '95%' }}
				/>
			)}
			contentContainerStyle={{ padding: 16, alignItems: 'center' }}
		/>
	);
}


function FavoriteRecommendationsList() {
	// Use the new hook to get full recommendation objects
	const { favorites, loading } = useFavoriteRecommendationsFull();

	if (loading) {
		return (
			<View style={common.containerCentered}>
				<ActivityIndicator size="large" color="#49bc8e" />
			</View>
		);
	}
	if (!favorites.length) {
		return (
			<View style={common.containerCentered}>
				<Text style={typography.h2}>ההמלצות המועדפות שלך</Text>
				<Text style={typography.body}>לא שמרת המלצות עדיין</Text>
			</View>
		);
	}

	return (
		<FlatList
			data={favorites}
			keyExtractor={item => item.id}
			renderItem={({ item }) => (
				<View style={{ alignItems: 'center', width: '100%' }}>
					{/* ✅ FIX: We wrap the card in a View with the specific width. 
					    The card will expand to fill this wrapper. */}
					<View style={{ width: FAVORITE_CARD_WIDTH, maxWidth: '95%' }}>
						<RecommendationCard
							item={{
								id: item.id,
								title: item.name || 'Untitled',
								description: item.sub_text || '',
								images: item.thumbnail_url ? [item.thumbnail_url] : [],
								rating: item.rating,
								...item
							}}
							showActionBar={false}
							// ❌ We removed the 'style' prop from here since the component ignores it
						/>
					</View>
				</View>
			)}
			contentContainerStyle={{ padding: 16, alignItems: 'center' }}
		/>
	);
}

export default function FavoritesScreen({ navigation }) {
	const [activeTab, setActiveTab] = useState('destinations');

	const renderTabContent = (activeTab) => {
		switch (activeTab) {
			case 'destinations':
				return <FavoriteCitiesList navigation={navigation} />;
			case 'recommendations':
				return <FavoriteRecommendationsList />;
			case 'trips':
				return (
					<View style={common.containerCentered}>
						<Text style={typography.h2}>טיולים חכמים (בקרוב)</Text>
						<Text style={typography.body}>הפיצ'ר של מתכנן חכם יגיע בקרוב</Text>
					</View>
				);
			case 'roadtrips':
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
