import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Image,
	RefreshControl,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { collectionGroup, getDocs, limit, orderBy, query } from "firebase/firestore";

import CityCard from "../../../components/CityCard";
import GooglePlacesInput from "../../../components/GooglePlacesInput";
import { db } from "../../../config/firebase";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { getOrCreateDestination } from "../../../services/LocationService";
import { colors } from "../../../styles";

const CATEGORY_CHIPS = [
	{ id: "all", label: "הכל", icon: "compass-outline" },
	{ id: "beach", label: "ים", icon: "beach" },
	{ id: "city", label: "עיר", icon: "city-variant-outline" },
	{ id: "adventure", label: "הרפתקה", icon: "hiking" },
	{ id: "food", label: "אוכל", icon: "silverware-fork-knife" },
	{ id: "culture", label: "תרבות", icon: "bank-outline" },
];

const FEATURED_BADGES = ["חם עכשיו", "בחירת הקהילה", "חדש"];
const DESTINATION_GRADIENTS = [
	["#1A6B8A", "#2D9CDB"],
	["#B8860B", "#DAA520"],
	["#2D4A7A", "#4A7AB5"],
	["#1A3A5C", "#2E6699"],
	["#8B1A4A", "#C94B7B"],
	["#7A3A1A", "#C05C1A"],
];

export default function HomeScreen({ navigation }) {
	const insets = useSafeAreaInsets();
	const isFocused = useIsFocused();
	const { user, isGuest } = useAuthUser();
	const [destinations, setDestinations] = useState([]);
	const [allDestinationsForSearch, setAllDestinationsForSearch] = useState([]);
	const [
		hasLoadedAllDestinationsForSearch,
		setHasLoadedAllDestinationsForSearch,
	] = useState(false);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeCategory, setActiveCategory] = useState("all");
	const [savedCityIds, setSavedCityIds] = useState({});
	const isFetchingAllDestinationsForSearchRef = useRef(false);
	const allDestinationsFetchDebounceRef = useRef(null);

	const fetchDestinations = async () => {
		try {
			const citiesQuery = query(
				collectionGroup(db, "cities"),
				orderBy("recommendationsCount", "desc"),
				limit(10)
			);
			const querySnapshot = await getDocs(citiesQuery);

			const citiesList = querySnapshot.docs.map((doc, index) => {
				const parentCountry = doc.ref.parent.parent;
				const countryId = parentCountry ? parentCountry.id : "Unknown";
				const gradient = DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length];

				return {
					id: doc.id,
					countryId,
					placeholderColor: gradient[0],
					...doc.data(),
				};
			});

			setDestinations(citiesList);
		} catch (error) {
			console.error("Error fetching destinations:", error);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	const fetchAllDestinationsForSearch = async () => {
		if (isFetchingAllDestinationsForSearchRef.current) return;
		isFetchingAllDestinationsForSearchRef.current = true;
		try {
			const citiesQuery = query(collectionGroup(db, "cities"));
			const querySnapshot = await getDocs(citiesQuery);

			const citiesList = querySnapshot.docs.map((doc, index) => {
				const parentCountry = doc.ref.parent.parent;
				const countryId = parentCountry ? parentCountry.id : "Unknown";
				const gradient = DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length];

				return {
					id: doc.id,
					countryId,
					placeholderColor: gradient[0],
					...doc.data(),
				};
			});

			setAllDestinationsForSearch(citiesList);
			setHasLoadedAllDestinationsForSearch(true);
		} catch (error) {
			console.error("Error fetching all destinations for search:", error);
		} finally {
			isFetchingAllDestinationsForSearchRef.current = false;
		}
	};

	useEffect(() => {
		fetchDestinations();
	}, []);

	useEffect(() => {
		const q = searchQuery.trim();
		if (q.length < 2) return;
		if (hasLoadedAllDestinationsForSearch) return;

		if (allDestinationsFetchDebounceRef.current) {
			clearTimeout(allDestinationsFetchDebounceRef.current);
		}

		allDestinationsFetchDebounceRef.current = setTimeout(() => {
			fetchAllDestinationsForSearch();
		}, 400);

		return () => {
			if (allDestinationsFetchDebounceRef.current) {
				clearTimeout(allDestinationsFetchDebounceRef.current);
				allDestinationsFetchDebounceRef.current = null;
			}
		};
	}, [searchQuery, hasLoadedAllDestinationsForSearch]);

	const onRefresh = () => {
		setRefreshing(true);
		setHasLoadedAllDestinationsForSearch(false);
		setAllDestinationsForSearch([]);
		isFetchingAllDestinationsForSearchRef.current = false;
		fetchDestinations();
	};

	const searchableDestinations = searchQuery.trim()
		? hasLoadedAllDestinationsForSearch
			? allDestinationsForSearch
			: destinations
		: destinations;

	const filteredDestinations = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return searchableDestinations.filter((city) => {
			if (!q) return true;

			const name = (city.name || "").toLowerCase();
			const description = (city.description || "").toLowerCase();
			const countryId = (city.countryId || "").toLowerCase();
			const country = (city.country || city.countryName || "").toLowerCase();

			return (
				name.includes(q) ||
				description.includes(q) ||
				countryId.includes(q) ||
				country.includes(q)
			);
		});
	}, [searchableDestinations, searchQuery]);

	const localAutocompleteResults = searchQuery.trim()
		? filteredDestinations.slice(0, 20)
		: [];

	const localResultsLoading =
		searchQuery.trim().length >= 2 && !hasLoadedAllDestinationsForSearch;

	const featuredDestinations = useMemo(
		() => destinations.slice(0, 3),
		[destinations]
	);

	const profileInitial = useMemo(() => {
		const source = user?.displayName || user?.email || "א";
		return source.charAt(0).toUpperCase();
	}, [user]);

	const handleGoogleSelect = async (placeId) => {
		try {
			const result = await getOrCreateDestination(placeId);

			if (result) {
				const createdOrExistingCity = {
					...(result.city || {}),
					id: result.city?.id,
					countryId: result.country?.id,
				};

				if (
					createdOrExistingCity?.id &&
					createdOrExistingCity?.countryId
				) {
					setDestinations((prev) => {
						const next = [
							createdOrExistingCity,
							...(prev || []).filter(
								(c) => c.id !== createdOrExistingCity.id
							),
						];
						return next.slice(0, 10);
					});

					if (hasLoadedAllDestinationsForSearch) {
						setAllDestinationsForSearch((prev) => {
							const next = [
								createdOrExistingCity,
								...(prev || []).filter(
									(c) => c.id !== createdOrExistingCity.id
								),
							];
							return next;
						});
					}
				}

				navigation.navigate("LandingPage", {
					cityId: result.city.id,
					countryId: result.country.id,
				});
			}
		} catch (error) {
			console.error(error);
			alert("לא ניתן לטעון את היעד.");
		}
	};

	const goToDestination = (city) => {
		if (!city?.id || !city?.countryId) return;
		navigation.navigate("LandingPage", {
			cityId: city.id,
			countryId: city.countryId,
		});
	};

	const toggleSavedVisual = (cityId) => {
		setSavedCityIds((prev) => ({
			...prev,
			[cityId]: !prev[cityId],
		}));
	};

	const renderProfileAvatar = () => (
		<TouchableOpacity
			style={styles.avatarButton}
			activeOpacity={0.85}
			onPress={() => navigation.navigate(isGuest ? "Auth" : "Profile")}
		>
			{user?.photoURL ? (
				<Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
			) : (
				<Text style={styles.avatarInitial}>{profileInitial}</Text>
			)}
			<View style={styles.avatarBadge} />
		</TouchableOpacity>
	);

	const renderHeader = () => (
		<LinearGradient
			colors={["#4C72FF", "#3157E7", "#2446C7"]}
			start={{ x: 0.15, y: 0 }}
			end={{ x: 0.9, y: 1 }}
			style={[styles.header, { paddingTop: insets.top + 4 }]}
		>
			<View style={styles.headerCircleLarge} />
			<View style={styles.headerCircleSmall} />

			<View style={styles.headerTop}>
				{renderProfileAvatar()}
			</View>

			<View style={styles.headlineWrap}>
				<Text style={styles.headline}>יאללה,{"\n"}לאן טסים?</Text>
			</View>

			<View style={styles.searchWrap}>
				<GooglePlacesInput
					mode="google"
					value={searchQuery}
					onChangeValue={setSearchQuery}
					localResults={localAutocompleteResults}
					localResultsLoading={localResultsLoading}
					inputTestID="home-search-input"
					placeholder="חפש עיר או יעד..."
					onSelectLocal={goToDestination}
					onSelect={handleGoogleSelect}
					googleFallbackDelayMs={2000}
					searchIconColor="rgba(255,255,255,0.55)"
					searchIconStyle={styles.searchIcon}
					placeholderTextColor="rgba(255,255,255,0.48)"
					loaderColor="#FFFFFF"
					loaderStyle={styles.searchLoader}
					inputWrapperStyle={styles.searchInputWrapper}
					inputStyle={styles.searchInput}
					listContainerStyle={styles.searchDropdown}
					rightAccessory={
						<TouchableOpacity style={styles.filterButton} activeOpacity={0.85}>
							<Ionicons name="options-outline" size={18} color="#FFFFFF" />
						</TouchableOpacity>
					}
				/>
			</View>
		</LinearGradient>
	);

	const renderCategories = () => (
		<View style={styles.sectionFirst}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.categoryScroll}
				contentContainerStyle={styles.categoryContent}
			>
				{CATEGORY_CHIPS.map((category) => {
					const isActive = activeCategory === category.id;
					return (
						<TouchableOpacity
							key={category.id}
							style={[styles.categoryChip, isActive && styles.categoryChipActive]}
							activeOpacity={0.85}
							onPress={() => setActiveCategory(category.id)}
						>
							<MaterialCommunityIcons
								name={category.icon}
								size={16}
								color={isActive ? "#FFFFFF" : "#5E6575"}
							/>
							<Text
								style={[
									styles.categoryText,
									isActive && styles.categoryTextActive,
								]}
							>
								{category.label}
							</Text>
						</TouchableOpacity>
					);
				})}
			</ScrollView>
		</View>
	);

	const renderFeaturedCard = (city, index) => {
		const gradient = DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length];
		const imageUrl = city?.imageUrl;

		return (
			<TouchableOpacity
				key={city.id}
				style={styles.featuredCard}
				activeOpacity={0.9}
				onPress={() => goToDestination(city)}
			>
				{imageUrl ? (
					<Image source={{ uri: imageUrl }} style={styles.featuredImage} resizeMode="cover" />
				) : (
					<LinearGradient colors={gradient} style={styles.featuredImage} />
				)}
				<LinearGradient
					colors={["rgba(10,20,60,0.82)", "rgba(10,20,60,0.08)", "transparent"]}
					start={{ x: 0.5, y: 1 }}
					end={{ x: 0.5, y: 0 }}
					style={styles.featuredOverlay}
				/>
				<View style={styles.featuredContent}>
					<View style={styles.featuredBadge}>
						<Text style={styles.featuredBadgeText}>
							{FEATURED_BADGES[index] || FEATURED_BADGES[0]}
						</Text>
					</View>
					<Text style={styles.featuredCity} numberOfLines={1}>
						{city.name || city.id}
					</Text>
					<Text style={styles.featuredCountry} numberOfLines={1}>
						{city.country || city.countryName || city.countryId}
					</Text>
				</View>
			</TouchableOpacity>
		);
	};

	const renderFeatured = () => (
		<View style={styles.section}>
			<View style={styles.sectionHeader}>
				<TouchableOpacity activeOpacity={0.7}>
					<Text style={styles.sectionLink}>הצג הכל</Text>
				</TouchableOpacity>
				<View style={styles.sectionTitleGroup}>
					<MaterialCommunityIcons name="fire" size={22} color="#F5961D" />
					<Text style={styles.sectionTitle}>חם עכשיו</Text>
				</View>
			</View>
			{featuredDestinations.length === 0 ? (
				<View style={styles.loadingRow}>
					{loading ? <ActivityIndicator color="#1B2D7A" /> : null}
					<Text style={styles.statusText}>
						{loading ? "טוען יעדים..." : "אין יעדים להצגה"}
					</Text>
				</View>
			) : (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.featuredContentScroll}
				>
					{featuredDestinations.map(renderFeaturedCard)}
				</ScrollView>
			)}
		</View>
	);

	const renderDestinations = () => (
		<View style={styles.section}>
			<View style={styles.sectionHeader}>
				<TouchableOpacity activeOpacity={0.7}>
					<Text style={styles.sectionLink}>הצג הכל</Text>
				</TouchableOpacity>
				<Text style={styles.sectionTitle}>יעדים פופולריים</Text>
			</View>

			<View style={styles.destinationGrid}>
				{loading && destinations.length === 0 ? (
					<View style={styles.fullWidthStatus}>
						<ActivityIndicator color="#1B2D7A" />
						<Text style={styles.statusText}>טוען יעדים...</Text>
					</View>
				) : filteredDestinations.length === 0 ? (
					<Text style={styles.emptyText} testID="home-empty-state">
						לא נמצאו יעדים
					</Text>
				) : (
					filteredDestinations.map((city) => (
						<CityCard
							key={city.id}
							city={city}
							variant="home"
							showTravelers={false}
							showSaveButton
							saved={!!savedCityIds[city.id]}
							onSavePress={() => toggleSavedVisual(city.id)}
							onPress={() => goToDestination(city)}
						/>
					))
				)}
			</View>
		</View>
	);

	return (
		<SafeAreaView style={styles.screen} edges={["left", "right"]}>
			{isFocused ? (
				<StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
			) : null}
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={[
					styles.scrollContent,
					{ paddingBottom: 116 + insets.bottom },
				]}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						colors={[colors.primary]}
						tintColor={colors.primary}
					/>
				}
			>
				{renderHeader()}
				<View style={styles.body}>
					{renderCategories()}
					{renderFeatured()}
					{renderDestinations()}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: "#3157E7",
	},
	scroll: {
		flex: 1,
		backgroundColor: "#F4F5F9",
	},
	scrollContent: {
		backgroundColor: "#F4F5F9",
	},
	header: {
		paddingHorizontal: 20,
		paddingBottom: 18,
		borderBottomLeftRadius: 30,
		borderBottomRightRadius: 30,
		overflow: "hidden",
	},
	headerCircleLarge: {
		position: "absolute",
		width: 210,
		height: 210,
		borderRadius: 105,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.06)",
		top: -58,
		right: -44,
	},
	headerCircleSmall: {
		position: "absolute",
		width: 134,
		height: 134,
		borderRadius: 67,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.08)",
		top: 30,
		right: 24,
	},
	headerTop: {
		position: "relative",
		zIndex: 2,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 0,
		minHeight: 40,
	},
	avatarButton: {
		position: "absolute",
		left: 0,
		top: 0,
		width: 42,
		height: 42,
		borderRadius: 21,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F5961D",
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.22)",
	},
	avatarImage: {
		width: "100%",
		height: "100%",
		borderRadius: 21,
	},
	avatarInitial: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "800",
	},
	avatarBadge: {
		position: "absolute",
		bottom: 0,
		right: 0,
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#00D4AA",
		borderWidth: 2,
		borderColor: "#1B2D7A",
	},
	headlineWrap: {
		position: "relative",
		zIndex: 2,
		alignItems: "flex-end",
		marginTop: -4,
		marginBottom: 12,
	},
	headline: {
		color: "#FFFFFF",
		fontSize: 34,
		lineHeight: 34,
		fontWeight: "800",
		textAlign: "right",
		writingDirection: "rtl",
	},
	subtitle: {
		marginTop: 8,
		color: "rgba(255,255,255,0.62)",
		fontSize: 14,
		fontWeight: "500",
		textAlign: "right",
		writingDirection: "rtl",
	},
	searchWrap: {
		position: "relative",
		zIndex: 20,
	},
	searchInputWrapper: {
		height: 50,
		borderRadius: 16,
		backgroundColor: "rgba(255,255,255,0.12)",
		borderWidth: 1.5,
		borderColor: "rgba(255,255,255,0.18)",
		paddingHorizontal: 0,
	},
	searchInput: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "500",
		paddingLeft: 58,
		paddingRight: 48,
		textAlign: "right",
		writingDirection: "rtl",
	},
	searchIcon: {
		top: 15,
	},
	searchLoader: {
		left: 56,
		top: 16,
	},
	filterButton: {
		position: "absolute",
		left: 8,
		top: 8,
		width: 34,
		height: 34,
		borderRadius: 10,
		backgroundColor: "#F5961D",
		alignItems: "center",
		justifyContent: "center",
	},
	searchDropdown: {
		top: 58,
		borderRadius: 16,
		borderColor: "rgba(27,45,122,0.12)",
	},
	body: {
		backgroundColor: "#F4F5F9",
		paddingBottom: 8,
	},
	sectionFirst: {
		paddingTop: 24,
	},
	categoryScroll: {
		direction: "rtl",
	},
	categoryContent: {
		flexDirection: "row",
		direction: "rtl",
		gap: 10,
		paddingHorizontal: 20,
		paddingBottom: 4,
	},
	categoryChip: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 7,
		paddingHorizontal: 16,
		paddingVertical: 9,
		borderRadius: 40,
		backgroundColor: "#FFFFFF",
		borderWidth: 1.5,
		borderColor: "#E8E9F0",
	},
	categoryChipActive: {
		backgroundColor: "#1B2D7A",
		borderColor: "#1B2D7A",
	},
	categoryText: {
		fontSize: 13,
		fontWeight: "700",
		color: "#555A66",
		writingDirection: "rtl",
	},
	categoryTextActive: {
		color: "#FFFFFF",
	},
	section: {
		paddingTop: 24,
		paddingHorizontal: 20,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 14,
	},
	sectionTitleGroup: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 6,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: "#0F1729",
		textAlign: "right",
		writingDirection: "rtl",
	},
	sectionLink: {
		fontSize: 13,
		color: "#1B2D7A",
		fontWeight: "700",
		textAlign: "left",
		writingDirection: "rtl",
	},
	featuredContentScroll: {
		flexDirection: "row-reverse",
		gap: 14,
		paddingRight: 0,
		paddingLeft: 4,
	},
	featuredCard: {
		width: 280,
		height: 180,
		borderRadius: 20,
		overflow: "hidden",
		position: "relative",
		backgroundColor: "#1B2D7A",
	},
	featuredImage: {
		width: "100%",
		height: "100%",
	},
	featuredOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	featuredTravelers: {
		position: "absolute",
		top: 12,
		right: 12,
		backgroundColor: "rgba(255,255,255,0.18)",
		borderRadius: 20,
		paddingHorizontal: 10,
		paddingVertical: 6,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 4,
	},
	featuredTravelersText: {
		color: "#FFFFFF",
		fontSize: 11,
		fontWeight: "700",
		writingDirection: "rtl",
	},
	featuredContent: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 16,
		paddingBottom: 14,
		alignItems: "flex-end",
	},
	featuredBadge: {
		backgroundColor: "#F5961D",
		paddingHorizontal: 9,
		paddingVertical: 4,
		borderRadius: 20,
		marginBottom: 7,
	},
	featuredBadgeText: {
		color: "#FFFFFF",
		fontSize: 10,
		fontWeight: "800",
		writingDirection: "rtl",
	},
	featuredCity: {
		color: "#FFFFFF",
		fontSize: 21,
		fontWeight: "800",
		textAlign: "right",
		writingDirection: "rtl",
	},
	featuredCountry: {
		marginTop: 3,
		color: "rgba(255,255,255,0.74)",
		fontSize: 12,
		fontWeight: "600",
		textAlign: "right",
		writingDirection: "rtl",
	},
	destinationGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
	},
	loadingRow: {
		minHeight: 80,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row-reverse",
		gap: 8,
	},
	fullWidthStatus: {
		width: "100%",
		minHeight: 140,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	statusText: {
		color: "#6B7280",
		fontSize: 14,
		fontWeight: "600",
		textAlign: "center",
		writingDirection: "rtl",
	},
	emptyText: {
		width: "100%",
		color: "#6B7280",
		fontSize: 16,
		fontWeight: "700",
		textAlign: "center",
		paddingVertical: 36,
		writingDirection: "rtl",
	},
});
