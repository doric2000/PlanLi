import { useState, useCallback } from "react"; // 1. Import useCallback
import {
	View,
	Text,
	ActivityIndicator,
	FlatList,
	RefreshControl,
	TouchableOpacity,
	Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native"; // 2. Import useFocusEffect
import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, orderBy, query, deleteDoc, doc } from "firebase/firestore";
import { db, auth } from "../../../config/firebase";
import { useRefresh } from "../../community/hooks/useRefresh";
import { SafeAreaView } from "react-native-safe-area-context";
import { common, buttons, colors } from "../../../styles";
import FabButton from '../../../components/FabButton';
import { RouteCard } from "../components/RouteCard";
import { GenerateTripCard } from "../components/GenerateTripCard";

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
		} finally {
            // Ensure loading is set to false even if there is an error
            setLoading(false);
        }
	};

	const { isRefreshing, onRefresh } = useRefresh(fetchRoutes);

    // 3. REPLACE useEffect with useFocusEffect
    // This ensures the data is fetched every time you look at this screen
	useFocusEffect(
		useCallback(() => {
			fetchRoutes();
		}, [])
	);

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
			<View style={common.screenHeader}>
				<Text style={common.screenHeaderTitle}>מסלולים</Text>
				<Text style={common.screenHeaderSubtitle}>
					המסלולים הכי שווים, ישר מהשטח
				</Text>
			</View>
			{loading ? (
				<ActivityIndicator style={{ marginTop: 20 }} size="large" color={colors.primary} />
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
							colors={[colors.primary]}
							tintColor={colors.primary}
						/>
					}
					ListEmptyComponent={
						<Text style={{ textAlign: "center", marginTop: 20, color: colors.textSecondary }}>
							No routes yet. Start by adding one!
						</Text>
					}
				/>
			)}
			{/* Floating Action Button (FAB) */}
      		<FabButton onPress={() => navigation.navigate('AddRoutesScreen')} />
		</SafeAreaView>
	);
}