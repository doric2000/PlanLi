import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { common } from "../../../styles/common";
import { typography } from "../../../styles/typography";
import { buttons } from "../../../styles/buttons";
import { tags } from "../../../styles/tags";

import { useFavoriteRecommendationIds } from '../../../hooks/useFavoriteRecommendationIds';
import RecommendationCard from '../../community/components/RecommendationCard';
import { useEffect, useState } from 'react';
import { db } from '../../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

const TABS = [
	{ key: 'destinations', label: 'יעדים' },
	{ key: 'recommendations', label: 'המלצות' },
	{ key: 'trips', label: 'טיולים' },
	{ key: 'roadtrips', label: 'מסלולים' },
];

export default function FavoritesScreen({ navigation }) {
	const [activeTab, setActiveTab] = useState('destinations');


	function FavoriteRecommendationsList() {
		const { ids, loading } = useFavoriteRecommendationIds();
		const [recommendations, setRecommendations] = useState([]);
		const [loadingRecs, setLoadingRecs] = useState(false);

		useEffect(() => {
			if (!ids || ids.length === 0) {
				setRecommendations([]);
				setLoadingRecs(false);
				return;
			}
			let isMounted = true;
			setLoadingRecs(true);
			Promise.all(
				ids.map(id => getDoc(doc(db, 'recommendations', id)))
			).then(snaps => {
				if (!isMounted) return;
				setRecommendations(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
				setLoadingRecs(false);
			});
			return () => { isMounted = false; };
		}, [ids]);

		if (loading || loadingRecs) {
			return (
				<View style={common.containerCentered}>
					<ActivityIndicator size="large" color="#49bc8e" />
				</View>
			);
		}
		if (!recommendations.length) {
			return (
				<View style={common.containerCentered}>
					<Text style={typography.h2}>ההמלצות המועדפות שלך</Text>
					<Text style={typography.body}>לא שמרת המלצות עדיין</Text>
				</View>
			);
		}
		return (
			<FlatList
				data={recommendations}
				keyExtractor={item => item.id}
				renderItem={({ item }) => (
					<RecommendationCard item={item} showActionBar={false} />
				)}
				contentContainerStyle={{ padding: 16 }}
			/>
		);
	}

	// Placeholder content for each tab
	const renderTabContent = (activeTab) => {
		switch (activeTab) {
			case 'destinations':
				return (
					<View style={common.containerCentered}>
						<Text style={typography.h2}>היעדים המועדפים שלך</Text>
						<Text style={typography.body}>כאן תוכל לראות את כל היעדים ששמרת</Text>
					</View>
				);
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
