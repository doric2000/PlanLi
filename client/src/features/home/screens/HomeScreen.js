import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator, Alert, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { collectionGroup, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import CityCard from "../../../components/CityCard";
import CachedImage from "../../../components/CachedImage";
import DestinationFilterModal from "../../../components/DestinationFilterModal";
import GooglePlacesInput from "../../../components/GooglePlacesInput";
import PageHeader from "../../../components/PageHeader";
import { db } from "../../../config/firebase";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { useFavoriteCityIds } from "../../../hooks/useFavoriteCityIds";
import { useSmartProfile } from "../../../hooks/useSmartProfile";
import { useTabPressScrollOrRefresh } from "../../../hooks/useTabPressScrollOrRefresh";
import { resolveDestinationForPlacePreview } from "../../../services/LocationService";
import { colors, homeScreenStyles as styles, preferenceSetupStyles as preferenceStyles } from "../../../styles";
import { filterAndSortDestinations, mergeDestinations } from "../../../utils/destinationSearch";

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
	const { completed: preferencesCompleted, loading: preferencesLoading } = useSmartProfile();
	const [destinations, setDestinations] = useState([]);
	const [allDestinationsForSearch, setAllDestinationsForSearch] = useState([]);
	const [
		hasLoadedAllDestinationsForSearch,
		setHasLoadedAllDestinationsForSearch,
	] = useState(false);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [destinationFilterVisible, setDestinationFilterVisible] = useState(false);
	const [destinationSort, setDestinationSort] = useState("popular");
	const [savedOnly, setSavedOnly] = useState(false);
	const isFetchingAllDestinationsForSearchRef = useRef(false);
	const allDestinationsFetchDebounceRef = useRef(null);
	const mainScrollRef = useRef(null);
	const favoriteCities = useFavoriteCityIds({ enabled: Boolean(user) && !isGuest });

	const fetchDestinations = async () => {
		try {
			const citiesQuery = query(
				collectionGroup(db, "cities"),
				where("status", "==", "active"),
				orderBy("stats.recommendationCount", "desc"),
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
			const citiesQuery = query(
				collectionGroup(db, "cities"),
				where("status", "==", "active"),
				limit(100)
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

	const searchableDestinations = searchQuery.trim() || destinationSort !== "popular" || savedOnly
		? hasLoadedAllDestinationsForSearch
			? allDestinationsForSearch
			: destinations
		: destinations;
	const favoriteKeys = useMemo(
		() => new Set(favoriteCities.favorites.map((city) => `${city.countryId}:${city.id}`)),
		[favoriteCities.favorites]
	);
	const destinationPool = useMemo(
		() => mergeDestinations(searchableDestinations, favoriteCities.favorites),
		[searchableDestinations, favoriteCities.favorites]
	);

	const filteredDestinations = useMemo(() => {
		return filterAndSortDestinations(destinationPool, {
			query: searchQuery,
			sortBy: destinationSort,
			savedOnly,
			favoriteKeys,
		});
	}, [destinationPool, searchQuery, destinationSort, savedOnly, favoriteKeys]);

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
			if (isGuest || !user) {
				Alert.alert("Login required", "Sign in to select a new Google destination.");
				navigation.navigate("Login");
				return;
			}
			if (!user.emailVerified) {
				Alert.alert("Verification required", "Verify your email before adding a destination.");
				navigation.navigate("VerifyEmail");
				return;
			}
			const result = await resolveDestinationForPlacePreview(placeId);
			if (result?.persisted) {
				navigation.navigate("LandingPage", {
					cityId: result.destination.city.id,
					countryId: result.destination.country.id,
				});
				return;
			}

			navigation.navigate("AddRecommendation", {
				prefillLocation: {
					destination: {
						country: result.destination.country,
						city: result.destination.city,
					},
					place: {
						placeId,
						name: result.place?.name || result.destination.city?.name || null,
						address: result.place?.address || result.destination.city?.description || null,
						...(result.destination.city?.coordinates
							? { coordinates: result.destination.city.coordinates }
							: {}),
					},
				},
			});
		} catch (error) {
			console.error(error);
			Alert.alert("שגיאה", "לא ניתן לטעון את היעד.");
		}
	};

	const goToDestination = (city) => {
		if (!city?.id || !city?.countryId) return;
		navigation.navigate("LandingPage", {
			cityId: city.id,
			countryId: city.countryId,
		});
	};

	const openDestinationFilters = () => {
		setDestinationFilterVisible(true);
		if (!hasLoadedAllDestinationsForSearch) fetchAllDestinationsForSearch();
	};

	const toggleCityFavorite = async (city) => {
		if (!user || isGuest) {
			Alert.alert("נדרשת התחברות", "כדי לשמור יעד במועדפים צריך להתחבר.");
			return;
		}
		try {
			await favoriteCities.toggleFavorite(city);
		} catch (error) {
			console.error("Failed to toggle destination favorite:", error);
			Alert.alert("שגיאה", "לא הצלחנו לעדכן את המועדפים. נסו שוב.");
		}
	};

	const renderProfileAvatar = () => (
		<TouchableOpacity
			style={styles.avatarButton}
			activeOpacity={0.85}
			onPress={() => navigation.navigate(isGuest ? "Auth" : "Profile")}
		>
			{user?.photoURL ? (
				<CachedImage
					source={{ uri: user.photoURL }}
					style={styles.avatarImage}
					contentFit="cover"
					priority="high"
				/>
			) : (
				<Text style={styles.avatarInitial}>{profileInitial}</Text>
			)}
			<View style={styles.avatarBadge} />
		</TouchableOpacity>
	);

	const renderHeader = () => (
		<PageHeader variant="hero">

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
						<TouchableOpacity
							style={[styles.filterButton, (savedOnly || destinationSort !== "popular") && styles.filterButtonActive]}
							activeOpacity={0.85}
							onPress={openDestinationFilters}
							accessibilityRole="button"
							accessibilityLabel="סינון יעדים"
						>
							<Ionicons name="options-outline" size={18} color="#FFFFFF" />
							{savedOnly || destinationSort !== "popular" ? <View style={styles.filterBadge} /> : null}
						</TouchableOpacity>
					}
				/>
			</View>
		</PageHeader>
	);

	const openPreferenceSetup = () => {
		let rootNavigation = navigation;
		let parent = rootNavigation?.getParent?.();
		while (parent) {
			rootNavigation = parent;
			parent = rootNavigation?.getParent?.();
		}
		rootNavigation?.navigate?.('PreferenceSetup');
	};

	const renderPreferencePrompt = () => {
		if (isGuest || preferencesLoading || preferencesCompleted) return null;
		return (
			<View style={preferenceStyles.promptCard} testID="home-preferences-prompt">
				<Text style={preferenceStyles.promptTitle}>בואו נתאים את PlanLi אליכם</Text>
				<Text style={preferenceStyles.promptText}>כמה בחירות קצרות יעזרו לנו להציג קודם המלצות שמתאימות לסגנון שלכם.</Text>
				<TouchableOpacity style={preferenceStyles.promptButton} onPress={openPreferenceSetup}>
					<Text style={preferenceStyles.promptButtonText}>הגדרת העדפות</Text>
				</TouchableOpacity>
			</View>
		);
	};

	const renderFeaturedCard = (city, index) => {
		const gradient = DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length];
		const imageUrl = city?.externalImageUrl || city?.imageUrl;

		return (
			<TouchableOpacity
				key={city.id}
				style={styles.featuredCard}
				activeOpacity={0.9}
				onPress={() => goToDestination(city)}
			>
				{imageUrl ? (
					<CachedImage
						source={{ uri: imageUrl }}
						style={styles.featuredImage}
						contentFit="cover"
						priority={index === 0 ? "high" : "low"}
					/>
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
							saved={favoriteKeys.has(`${city.countryId}:${city.id}`)}
							onSavePress={() => toggleCityFavorite(city)}
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
				{renderPreferencePrompt()}
				<View style={styles.body}>
					{renderFeatured()}
					{renderDestinations()}
				</View>
			</ScrollView>
			<DestinationFilterModal
				visible={destinationFilterVisible}
				onClose={() => setDestinationFilterVisible(false)}
				sortBy={destinationSort}
				onSortChange={setDestinationSort}
				savedOnly={savedOnly}
				onSavedOnlyChange={setSavedOnly}
				favoritesAvailable={Boolean(user) && !isGuest}
			/>
		</SafeAreaView>
	);
}
