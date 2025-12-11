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
import { collection, getDocs, orderBy, query, deleteDoc, doc } from "firebase/firestore";
import { db, auth } from "../../../config/firebase";
import { useRefresh } from "../../community/hooks/useRefresh";
import { SafeAreaView } from "react-native-safe-area-context";
import { common, buttons, colors } from "../../../styles";

import { RouteCard } from "../components/RouteCard";
import { GenerateTripCard } from "../components/GenerateTripCard";

/**
 * Screen for displaying a list of routes.
 * Allows users to view, add, edit, and delete routes.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function RoutesScreen({ navigation }) {
	const [routes, setRoutes] = useState([]);
	const [loading, setLoading] = useState(true);
	const currentUser = auth.currentUser;

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

	const handleDelete = (routeId) => {
		Alert.alert(
			"Delete Route",
			"Are you sure you want to delete this route?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							await deleteDoc(doc(db, "routes", routeId));
							Alert.alert("Success", "Route deleted successfully");
							fetchRoutes();
						} catch (error) {
							console.error("Error deleting route:", error);
							Alert.alert("Error", "Failed to delete route");
						}
					},
				},
			]
		);
	};

	const handleEdit = (route) => {
		navigation.navigate("AddRoutesScreen", { routeToEdit: route });
	};

    const handleGenerateTrip = () => {
        // Placeholder for future functionality
        Alert.alert("Generate trip feature coming soon!");
    };

	const renderItem = ({ item }) => {
		const isOwner = currentUser && item.userId === currentUser.uid;
		return (
			<RouteCard 
				item={item} 
				onPress={() => navigation.navigate("RouteDetail", { routeData: item })}
				isOwner={isOwner}
				onEdit={() => handleEdit(item)}
				onDelete={() => handleDelete(item.id)}
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
							colors={[colors.textPrimary]} // Using dark theme color
							tintColor={colors.textPrimary}
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
