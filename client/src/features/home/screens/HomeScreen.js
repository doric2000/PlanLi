import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator, Image, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { collectionGroup, getDocs, limit, orderBy, query } from "firebase/firestore";

import CityCard from "../../../components/CityCard";
import GooglePlacesInput from "../../../components/GooglePlacesInput";
import { db } from "../../../config/firebase";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { useTabPressScrollOrRefresh } from "../../../hooks/useTabPressScrollOrRefresh";
import { getOrCreateDestination } from "../../../services/LocationService";
import { colors, homeScreenStyles as styles } from "../../../styles";

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
	const mainScrollRef = useRef(null);

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

	const { onScroll } = useTabPressScrollOrRefresh({
		variant: "scrollview",
		scrollRef: mainScrollRef,
		onRefresh,
	});

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
			colors={colors.heroBlueGradient}
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
					<MaterialCommunityIcons name="fire" size={22} color={colors.brandOrange} />
					<Text style={styles.sectionTitle}>חם עכשיו</Text>
				</View>
			</View>
			{featuredDestinations.length === 0 ? (
				<View style={styles.loadingRow}>
					{loading ? <ActivityIndicator color={colors.navActive} /> : null}
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
						<ActivityIndicator color={colors.navActive} />
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
				ref={mainScrollRef}
				style={styles.scroll}
				contentContainerStyle={[
					styles.scrollContent,
					{ paddingBottom: 116 + insets.bottom },
				]}
				onScroll={onScroll}
				scrollEventThrottle={16}
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
