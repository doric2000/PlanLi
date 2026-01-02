import { useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import FilterIconButton from '../../../components/FilterIconButton';
import RoutesFilterModal from "../../../components/RoutesFilterModal";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
	collection,
	getDocs,
	orderBy,
	query,
	deleteDoc,
	doc,
} from "firebase/firestore";
import { db, auth } from "../../../config/firebase";
import { useRefresh } from "../../community/hooks/useRefresh";
import { SafeAreaView } from "react-native-safe-area-context";
import { common, buttons, colors, spacing } from "../../../styles";
import FabButton from "../../../components/FabButton";
import { RouteCard } from "../components/RouteCard";
import { GenerateTripCard } from "../components/GenerateTripCard";
import { CommentsModal } from "../../../components/CommentsModal";


export default function RoutesScreen({ navigation }) {
	const [routes, setRoutes] = useState([]);
	const [loading, setLoading] = useState(true);
	const currentUser = auth.currentUser;

	// --- Filter Management ---
	const [filterVisible, setFilterVisible] = useState(false);
	const [filterQuery, setFilterQuery] = useState("");
	const [filterDifficulty, setFilterDifficulty] = useState("");
	const [filterTravelStyle, setFilterTravelStyle] = useState("");
	const [filterRoadTripTags, setFilterRoadTripTags] = useState([]);
	const [filterExperienceTags, setFilterExperienceTags] = useState([]);
	const [filterMinDays, setFilterMinDays] = useState("");
	const [filterMaxDays, setFilterMaxDays] = useState("");
	const [filterMinDistance, setFilterMinDistance] = useState("");
	const [filterMaxDistance, setFilterMaxDistance] = useState("");
	const [commentsModalVisible, setCommentsModalVisible] = useState(false);
	const [selectedRouteId, setSelectedRouteId] = useState(null);



	const fetchRoutes = async () => {
		try {
			const q = query(collection(db, "routes"), orderBy("createdAt", "desc"));
			const snap = await getDocs(q);
			const data = snap.docs.map((docSnap) => ({
				id: docSnap.id,
				...docSnap.data(),
			}));
			setRoutes(data);
		} catch (err) {
			console.log("Failed to load routes", err);
		} finally {
			setLoading(false);
		}
	};

	const { isRefreshing, onRefresh } = useRefresh(fetchRoutes);

	useFocusEffect(
		useCallback(() => {
			fetchRoutes();
		}, [])
	);

	const handleDelete = (routeId) => {
		Alert.alert("Delete Route", "Are you sure you want to delete this route?", [
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
		]);
	};

	const handleEdit = (route) => {
		navigation.navigate("AddRoutesScreen", { routeToEdit: route });
	};

	const handleGenerateTrip = () => {
		Alert.alert("Generate trip feature coming soon!");
	};

	const handleOpenComments = (routeId) => {
		setSelectedRouteId(routeId);
		setCommentsModalVisible(true);
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
				onCommentPress={handleOpenComments}
			/>
		);
	};

	// --- Filtering Logic ---
	const parseNumberOrNull = (value) => {
		if (value === null || value === undefined) return null;
		const trimmed = String(value).trim();
		if (!trimmed) return null;
		const n = Number(trimmed);
		return Number.isFinite(n) ? n : null;
	};

	const filteredRoutes = routes.filter((item) => {
		// Text query (supports comma-separated queries like: "rome, food")
		const queries = filterQuery
			.split(",")
			.map((q) => q.trim().toLowerCase())
			.filter((q) => q.length > 0);

		if (queries.length > 0) {
			const title = String(item?.Title ?? "").toLowerCase();
			const desc = String(item?.desc ?? "").toLowerCase();
			const places = Array.isArray(item?.places)
				? item.places.join(" ").toLowerCase()
				: "";
			const tagsText = Array.isArray(item?.tags)
				? item.tags.join(" ").toLowerCase()
				: "";
			const text = `${title} ${desc} ${places} ${tagsText}`;

			const matchesText = queries.some((q) => text.includes(q));
			if (!matchesText) return false;
		}

		// Single-select tags
		if (filterDifficulty && String(item?.difficultyTag ?? "") !== filterDifficulty)
			return false;

		if (filterTravelStyle && String(item?.travelStyleTag ?? "") !== filterTravelStyle)
			return false;

		// Multi-select tags (OR within each group, AND across groups)
		if (filterRoadTripTags.length > 0) {
			const itemTags = Array.isArray(item?.roadTripTags) ? item.roadTripTags : [];
			const hasAny = filterRoadTripTags.some((t) => itemTags.includes(t));
			if (!hasAny) return false;
		}

		if (filterExperienceTags.length > 0) {
			const itemTags = Array.isArray(item?.experienceTags) ? item.experienceTags : [];
			const hasAny = filterExperienceTags.some((t) => itemTags.includes(t));
			if (!hasAny) return false;
		}

		// Numeric ranges
		const minDays = parseNumberOrNull(filterMinDays);
		const maxDays = parseNumberOrNull(filterMaxDays);
		if (minDays !== null || maxDays !== null) {
			const days = parseNumberOrNull(item?.days);
			if (days === null) return false;
			if (minDays !== null && days < minDays) return false;
			if (maxDays !== null && days > maxDays) return false;
		}

		const minDistance = parseNumberOrNull(filterMinDistance);
		const maxDistance = parseNumberOrNull(filterMaxDistance);
		if (minDistance !== null || maxDistance !== null) {
			const distance = parseNumberOrNull(item?.distance);
			if (distance === null) return false;
			if (minDistance !== null && distance < minDistance) return false;
			if (maxDistance !== null && distance > maxDistance) return false;
		}

		return true;
	});

	const isFiltered =
		filterQuery.trim() !== "" ||
		filterDifficulty !== "" ||
		filterTravelStyle !== "" ||
		filterRoadTripTags.length > 0 ||
		filterExperienceTags.length > 0 ||
		filterMinDays.trim() !== "" ||
		filterMaxDays.trim() !== "" ||
		filterMinDistance.trim() !== "" ||
		filterMaxDistance.trim() !== "";

	const openFilterModal = () => setFilterVisible(true)

	const handleClearFilters = () => {
		setFilterQuery("");
		setFilterDifficulty("");
		setFilterTravelStyle("");
		setFilterRoadTripTags([]);
		setFilterExperienceTags([]);
		setFilterMinDays("");
		setFilterMaxDays("");
		setFilterMinDistance("");
		setFilterMaxDistance("");
		setFilterVisible(false);
	};


	const applyFilters = (next) => {
		setFilterQuery(next?.query || "");
		setFilterDifficulty(next?.difficulty || "");
		setFilterTravelStyle(next?.travelStyle || "");
		setFilterRoadTripTags(Array.isArray(next?.roadTripTags) ? next.roadTripTags : []);
		setFilterExperienceTags(Array.isArray(next?.experienceTags) ? next.experienceTags : []);
		setFilterMinDays(next?.minDays ?? "");
		setFilterMaxDays(next?.maxDays ?? "");
		setFilterMinDistance(next?.minDistance ?? "");
		setFilterMaxDistance(next?.maxDistance ?? "");
		setFilterVisible(false);
	};


	return (
		<SafeAreaView style={common.container}>
			<View style={common.screenHeader}>
				<Text style={common.screenHeaderTitle}>מסלולים</Text>
				<Text style={common.screenHeaderSubtitle}>המסלולים הכי שווים, ישר מהשטח</Text>

				{/* Filter button */}
				<FilterIconButton active={isFiltered} onPress={openFilterModal} />
			</View>

			{loading ? (
				<ActivityIndicator style={{ marginTop: 20 }} size="large" color={colors.primary} />
			) : (
				<FlatList
					contentContainerStyle={{ padding: 15 }}
					data={filteredRoutes}
					keyExtractor={(item) => item.id}
					renderItem={renderItem}
					ListHeaderComponent={<GenerateTripCard onPress={handleGenerateTrip} />}
					refreshControl={
						<RefreshControl
							refreshing={isRefreshing}
							onRefresh={onRefresh}
							colors={[colors.primary]}
							tintColor={colors.primary}
						/>
					}
					ListEmptyComponent={
						<View style={common.emptyState}>
							<Ionicons name="trail-sign-outline" size={50} color={colors.textMuted} />
							<Text style={common.emptyText}>
								{isFiltered ? "אין תוצאות מתאימות למסננים שבחרת." : "עדיין אין מסלולים."}
							</Text>
							{!isFiltered && <Text style={common.emptySubText}>היה הראשון לשתף מסלול!</Text>}
						</View>
					}
				/>
			)}

			{/* Floating Action Button (FAB) */}
			<FabButton onPress={() => navigation.navigate("AddRoutesScreen")} />

			{/* --- Filter Modal --- */}
			<RoutesFilterModal
				visible={filterVisible}
				onClose={() => setFilterVisible(false)}
				filters={{
					query: filterQuery,
					difficulty: filterDifficulty,
					travelStyle: filterTravelStyle,
					roadTripTags: filterRoadTripTags,
					experienceTags: filterExperienceTags,
					minDays: filterMinDays,
					maxDays: filterMaxDays,
					minDistance: filterMinDistance,
					maxDistance: filterMaxDistance,
				}}
				onApply={applyFilters}
				onClear={handleClearFilters}
			/>

			<CommentsModal
				visible={commentsModalVisible}
				onClose={() => setCommentsModalVisible(false)}
				postId={selectedRouteId}
				collectionName="routes"
			/>

		</SafeAreaView>
	);
}
