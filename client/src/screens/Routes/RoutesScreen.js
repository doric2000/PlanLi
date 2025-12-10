import { useEffect, useState } from "react";
import {
	View,
	Text,
	ActivityIndicator,
	FlatList,
	RefreshControl,
	TouchableOpacity,
	Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useRefresh } from "../../hooks/useRefresh";
import { SafeAreaView } from "react-native-safe-area-context";
import { common, buttons } from "../../styles";

import { RouteCard } from "../../components/RouteCard";
import { GenerateTripCard } from "../../components/GenerateTripCard";

const handleGenerateTrip = () => {
	// Placeholder for future functionality
	Alert.alert("Generate trip feature coming soon!");
};

export default function RoutesScreen({ navigation }) {
	const [routes, setRoutes] = useState([]);
	const [loading, setLoading] = useState(true);

	const fetchRoutes = async () => {
		try {
			const q = query(
				collection(db, "routes"),
				orderBy("createdAt", "desc")
			);
			const snap = await getDocs(q);
			const data = snap.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setRoutes(data);
		} catch (err) {
			console.log("Failed to load routes", err);
		}
	};

	const { isRefreshing, onRefresh } = useRefresh(fetchRoutes);

	useEffect(() => {
		const init = async () => {
			await fetchRoutes();
			setLoading(false);
		};
		init();
	}, []);

	const renderItem = ({ item }) => {
		return (
			<RouteCard 
				item={item} 
				onPress={() => navigation.navigate("RouteDetail", { routeData: item })} 
			/>
		);
	};

	return (
		<SafeAreaView style={common.container}>
			<View style={common.header}>
				<Text style={common.headerTitle}>מסלולים</Text>
				<Text style={common.headerSubTitle}>
					המסלולים הכי שווים, ישר מהשטח
				</Text>
			</View>

			{loading ? (
				<ActivityIndicator style={{ marginTop: 20 }} />
			) : (
				<FlatList
					contentContainerStyle={{ padding: 15 }}
					data={routes}
					keyExtractor={(item) => item.id}
					renderItem={renderItem}
					ListHeaderComponent={
						<GenerateTripCard onPress={handleGenerateTrip} />
					}
					refreshControl={
						<RefreshControl
							refreshing={isRefreshing}
							onRefresh={onRefresh}
							colors={["#1E3A5F"]}
							tintColor='#1E3A5F'
						/>
					}
					ListEmptyComponent={
						<Text style={{ textAlign: "center", marginTop: 20 }}>
							No routes yet.
						</Text>
					}
				/>
			)}

			<TouchableOpacity
				style={buttons.fab}
				onPress={() => navigation.navigate("AddRoutesScreen")}
			>
				<Ionicons name='add' size={32} color='#fff' />
			</TouchableOpacity>
		</SafeAreaView>
	);
}


