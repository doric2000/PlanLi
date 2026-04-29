import { useCallback, useState, useRef } from "react";
import {
	ActivityIndicator,
	Alert,
	FlatList,
	RefreshControl,
	StatusBar,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
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
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { db, auth } from "../../../config/firebase";
import { getUserTier } from "../../../utils/userTier";
import { useRefresh } from "../../community/hooks/useRefresh";
import { useTabPressScrollOrRefresh } from "../../../hooks/useTabPressScrollOrRefresh";
import { common, colors, routesScreenStyles as styles } from "../../../styles";
import FabButton from "../../../components/FabButton";
import { RouteCard } from "../components/RouteCard";
import { GenerateTripCard } from "../components/GenerateTripCard";
import { CommentsModal } from "../../../components/CommentsModal";
import ActiveRouteFiltersList from "../components/ActiveRouteFiltersList";

const text = {
	title: "\u05de\u05e1\u05dc\u05d5\u05dc\u05d9\u05dd",
	subtitle: "\u05de\u05e1\u05dc\u05d5\u05dc\u05d9 \u05d8\u05d9\u05d5\u05dc \u05de\u05d4\u05e7\u05d4\u05d9\u05dc\u05d4",
	filterLabel: "\u05de\u05e1\u05e0\u05e0\u05d9\u05dd",
	searchPlaceholder: "\u05d7\u05e4\u05e9 \u05de\u05e1\u05dc\u05d5\u05dc...",
	clearSearch: "\u05e0\u05e7\u05d4 \u05d7\u05d9\u05e4\u05d5\u05e9",
	deleteTitle: "\u05de\u05d7\u05d9\u05e7\u05ea \u05de\u05e1\u05dc\u05d5\u05dc",
	deleteMessage: "\u05d1\u05d8\u05d5\u05d7 \u05e9\u05d1\u05e8\u05e6\u05d5\u05e0\u05da \u05dc\u05de\u05d7\u05d5\u05e7 \u05d0\u05ea \u05d4\u05de\u05e1\u05dc\u05d5\u05dc?",
	cancel: "\u05d1\u05d9\u05d8\u05d5\u05dc",
	delete: "\u05de\u05d7\u05e7",
	success: "\u05d4\u05e6\u05dc\u05d7\u05d4",
	deleteSuccess: "\u05d4\u05de\u05e1\u05dc\u05d5\u05dc \u05e0\u05de\u05d7\u05e7.",
	error: "\u05e9\u05d2\u05d9\u05d0\u05d4",
	deleteError: "\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05de\u05d7\u05d5\u05e7 \u05d0\u05ea \u05d4\u05de\u05e1\u05dc\u05d5\u05dc.",
	generateSoon: "\u05d9\u05e6\u05d9\u05e8\u05ea \u05de\u05e1\u05dc\u05d5\u05dc \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9 \u05d1\u05e7\u05e8\u05d5\u05d1!",
	noFiltered: "\u05d0\u05d9\u05df \u05ea\u05d5\u05e6\u05d0\u05d5\u05ea \u05de\u05ea\u05d0\u05d9\u05de\u05d5\u05ea \u05dc\u05de\u05e1\u05e0\u05e0\u05d9\u05dd \u05e9\u05d1\u05d7\u05e8\u05ea.",
	noRoutes: "\u05e2\u05d3\u05d9\u05d9\u05df \u05d0\u05d9\u05df \u05de\u05e1\u05dc\u05d5\u05dc\u05d9\u05dd.",
	firstRoute: "\u05d4\u05d9\u05d4 \u05d4\u05e8\u05d0\u05e9\u05d5\u05df \u05dc\u05e9\u05ea\u05e3 \u05de\u05e1\u05dc\u05d5\u05dc!",
	loginRequired: "\u05d9\u05e9 \u05dc\u05d4\u05ea\u05d7\u05d1\u05e8",
	loginMessage: "\u05db\u05d3\u05d9 \u05dc\u05d9\u05e6\u05d5\u05e8 \u05de\u05e1\u05dc\u05d5\u05dc \u05e6\u05e8\u05d9\u05da \u05dc\u05d4\u05ea\u05d7\u05d1\u05e8.",
	verifyRequired: "\u05e0\u05d3\u05e8\u05e9 \u05d0\u05d9\u05de\u05d5\u05ea",
	verifyMessage: "\u05db\u05d3\u05d9 \u05dc\u05d9\u05e6\u05d5\u05e8 \u05de\u05e1\u05dc\u05d5\u05dc \u05e6\u05e8\u05d9\u05da \u05dc\u05d0\u05de\u05ea \u05d0\u05ea \u05d4\u05d0\u05d9\u05de\u05d9\u05d9\u05dc.",
};

const gradientStart = { x: 0.15, y: 0 };
const gradientEnd = { x: 0.9, y: 1 };

export default function RoutesScreen({ navigation }) {
	const insets = useSafeAreaInsets();
	const [routes, setRoutes] = useState([]);
	const [loading, setLoading] = useState(true);
	const currentUser = auth.currentUser;

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

	const routesListRef = useRef(null);
	const { onScroll: routesTabOnScroll } = useTabPressScrollOrRefresh({
		variant: "flatlist",
		scrollRef: routesListRef,
		onRefresh,
		enabled: !loading,
	});

	useFocusEffect(
		useCallback(() => {
			fetchRoutes();
		}, [])
	);

	const handleDelete = (routeId) => {
		Alert.alert(text.deleteTitle, text.deleteMessage, [
			{ text: text.cancel, style: "cancel" },
			{
				text: text.delete,
				style: "destructive",
				onPress: async () => {
					try {
						await deleteDoc(doc(db, "routes", routeId));
						Alert.alert(text.success, text.deleteSuccess);
						fetchRoutes();
					} catch (error) {
						console.error("Error deleting route:", error);
						Alert.alert(text.error, text.deleteError);
					}
				},
			},
		]);
	};

	const handleEdit = (route) => {
		navigation.navigate("AddRoutesScreen", { routeToEdit: route });
	};

	const handleGenerateTrip = () => {
		Alert.alert(text.generateSoon);
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
				variant="feed"
			/>
		);
	};

	const parseNumberOrNull = (value) => {
		if (value === null || value === undefined) return null;
		const trimmed = String(value).trim();
		if (!trimmed) return null;
		const n = Number(trimmed);
		return Number.isFinite(n) ? n : null;
	};

	const filteredRoutes = routes.filter((item) => {
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
			const searchText = `${title} ${desc} ${places} ${tagsText}`;
			if (!queries.some((q) => searchText.includes(q))) return false;
		}

		if (filterDifficulty && String(item?.difficultyTag ?? "") !== filterDifficulty) return false;
		if (filterTravelStyle && String(item?.travelStyleTag ?? "") !== filterTravelStyle) return false;

		if (filterRoadTripTags.length > 0) {
			const itemTags = Array.isArray(item?.roadTripTags) ? item.roadTripTags : [];
			if (!filterRoadTripTags.some((tag) => itemTags.includes(tag))) return false;
		}

		if (filterExperienceTags.length > 0) {
			const itemTags = Array.isArray(item?.experienceTags) ? item.experienceTags : [];
			if (!filterExperienceTags.some((tag) => itemTags.includes(tag))) return false;
		}

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

	const handleRemoveFilter = (type, value) => {
		switch (type) {
			case "query":
				setFilterQuery("");
				break;
			case "difficulty":
				setFilterDifficulty("");
				break;
			case "travelStyle":
				setFilterTravelStyle("");
				break;
			case "roadTripTag":
				setFilterRoadTripTags((prev) => prev.filter((tag) => tag !== value));
				break;
			case "experienceTag":
				setFilterExperienceTags((prev) => prev.filter((tag) => tag !== value));
				break;
			case "minDays":
				setFilterMinDays("");
				break;
			case "maxDays":
				setFilterMaxDays("");
				break;
			case "minDistance":
				setFilterMinDistance("");
				break;
			case "maxDistance":
				setFilterMaxDistance("");
				break;
			default:
				break;
		}
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

	const openCreateRoute = () => {
		const tier = getUserTier(auth.currentUser);
		if (tier === "guest") {
			Alert.alert(text.loginRequired, text.loginMessage);
			navigation.navigate("Login");
			return;
		}
		if (tier === "unverified") {
			Alert.alert(text.verifyRequired, text.verifyMessage);
			navigation.navigate("VerifyEmail");
			return;
		}
		navigation.navigate("AddRoutesScreen");
	};

	const renderTopArea = () => (
		<LinearGradient
			colors={colors.heroBlueGradient}
			start={gradientStart}
			end={gradientEnd}
			style={[styles.header, { paddingTop: insets.top + 6 }]}
		>
			<View style={styles.headerCircleLarge} />
			<View style={styles.headerCircleSmall} />

			<View style={styles.topActionsRow}>
				<TouchableOpacity
					style={[styles.glassIconButton, isFiltered && styles.glassIconButtonActive]}
					onPress={() => setFilterVisible(true)}
					accessibilityRole="button"
					accessibilityLabel={text.filterLabel}
				>
					<Ionicons name="filter" size={20} color="#FFFFFF" />
				</TouchableOpacity>

				<View style={styles.headerTitleWrap}>
					<Text style={styles.headerTitle}>{text.title}</Text>
					<Text style={styles.headerSubtitle}>{text.subtitle}</Text>
				</View>

				<View style={styles.headerSideSpacer} />
			</View>

			<View style={styles.searchRow}>
				<View style={styles.searchPill}>
					<Ionicons name="search" size={19} color="rgba(255,255,255,0.62)" />
					<TextInput
						value={filterQuery}
						onChangeText={setFilterQuery}
						placeholder={text.searchPlaceholder}
						placeholderTextColor="rgba(255,255,255,0.48)"
						style={styles.searchInput}
						textAlign="right"
						autoCorrect={false}
						autoCapitalize="none"
					/>
					{!!filterQuery && (
						<TouchableOpacity
							onPress={() => setFilterQuery("")}
							style={styles.destinationClearBtn}
							accessibilityRole="button"
							accessibilityLabel={text.clearSearch}
						>
							<Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.76)" />
						</TouchableOpacity>
					)}
				</View>
			</View>
		</LinearGradient>
	);

	return (
		<SafeAreaView style={styles.screen} edges={["left", "right"]}>
			<StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
			{renderTopArea()}

			<ActiveRouteFiltersList
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
				onRemove={handleRemoveFilter}
			/>

			{loading ? (
				<View style={common.center}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : (
				<FlatList
					ref={routesListRef}
					contentContainerStyle={styles.feedContent}
					data={filteredRoutes}
					keyExtractor={(item) => item.id}
					onScroll={routesTabOnScroll}
					scrollEventThrottle={16}
					renderItem={renderItem}
					ListHeaderComponent={
						<View style={styles.generateCardWrap}>
							<GenerateTripCard onPress={handleGenerateTrip} />
						</View>
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
						<View style={common.emptyState}>
							<Ionicons name="trail-sign-outline" size={50} color={colors.textMuted} />
							<Text style={common.emptyText}>
								{isFiltered ? text.noFiltered : text.noRoutes}
							</Text>
							{!isFiltered && <Text style={common.emptySubText}>{text.firstRoute}</Text>}
						</View>
					}
					showsVerticalScrollIndicator={false}
				/>
			)}

			<FabButton onPress={openCreateRoute} />

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
