import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	StatusBar,
	TouchableOpacity,
	View,
} from "react-native";
import AppText from "../../../components/AppText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import CityCard from "../../../components/CityCard";
import CachedImage from "../../../components/CachedImage";
import PhotoAttribution from "../../../components/PhotoAttribution";
import DestinationFilterModal from "../../../components/DestinationFilterModal";
import GooglePlacesInput from "../../../components/GooglePlacesInput";
import PageHeader from "../../../components/PageHeader";
import SearchFilterRow from "../../../components/SearchFilterRow";
import { useAuthUser } from "../../../hooks/useAuthUser";
import { useFavoriteCityIds } from "../../../hooks/useFavoriteCityIds";
import { useSmartProfile } from "../../../hooks/useSmartProfile";
import { useTabPressScrollOrRefresh } from "../../../hooks/useTabPressScrollOrRefresh";
import { resolveDestinationForPlacePreview } from "../../../services/LocationService";
import {
	destinationCatalogItemToCity,
	searchDestinations,
} from "../../../services/DestinationService";
import { colors, homeScreenStyles as styles, preferenceSetupStyles as preferenceStyles } from "../../../styles";
import { filterAndSortDestinations, mergeDestinations } from "../../../utils/destinationSearch";
import { getDestinationImageUrl } from "../../../utils/destinationImages";

const DESTINATION_GRADIENTS = [
	["#78909C", "#546E7A"],
	["#90A4AE", "#607D8B"],
	["#8295A3", "#526878"],
];

const ZERO_SCROLL_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const ZERO_SCROLL_OFFSET = { x: 0, y: 0 };

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
	const destinationSearchRequestRef = useRef(0);
	const allDestinationsFetchDebounceRef = useRef(null);
	const mainScrollRef = useRef(null);
	const favoriteCities = useFavoriteCityIds({ enabled: Boolean(user) && !isGuest });

	const fetchDestinations = async () => {
		try {
			const catalog = await searchDestinations({ sort: "popular", limit: 10 });
			const citiesList = (catalog?.items || []).map((item, index) => {
				const gradient = DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length];
				return destinationCatalogItemToCity(item, gradient[0]);
			});

			setDestinations(citiesList);
		} catch (error) {
			console.error("Error fetching destinations:", error);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	const fetchAllDestinationsForSearch = async (queryText = "") => {
		const requestId = destinationSearchRequestRef.current + 1;
		destinationSearchRequestRef.current = requestId;
		setHasLoadedAllDestinationsForSearch(false);
		try {
			const catalog = await searchDestinations({
				...(queryText ? { query: queryText } : {}),
				sort: destinationSort,
				limit: 30,
			});
			if (destinationSearchRequestRef.current !== requestId) return;
			const citiesList = (catalog?.items || []).map((item, index) => {
				const gradient = DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length];
				return destinationCatalogItemToCity(item, gradient[0]);
			});

			setAllDestinationsForSearch(citiesList);
			setHasLoadedAllDestinationsForSearch(true);
		} catch (error) {
			if (destinationSearchRequestRef.current !== requestId) return;
			console.error("Error fetching all destinations for search:", error);
		} finally {
			if (destinationSearchRequestRef.current === requestId) {
				setHasLoadedAllDestinationsForSearch(true);
			}
		}
	};

	useEffect(() => {
		fetchDestinations();
	}, []);

	useEffect(() => {
		const q = searchQuery.trim();
		if (q.length < 2) {
			destinationSearchRequestRef.current += 1;
			setAllDestinationsForSearch([]);
			setHasLoadedAllDestinationsForSearch(false);
			return undefined;
		}
		setHasLoadedAllDestinationsForSearch(false);

		if (allDestinationsFetchDebounceRef.current) {
			clearTimeout(allDestinationsFetchDebounceRef.current);
		}

		allDestinationsFetchDebounceRef.current = setTimeout(() => {
			fetchAllDestinationsForSearch(q);
		}, 400);

		return () => {
			if (allDestinationsFetchDebounceRef.current) {
				clearTimeout(allDestinationsFetchDebounceRef.current);
				allDestinationsFetchDebounceRef.current = null;
			}
		};
	}, [searchQuery]);

	const onRefresh = () => {
		setRefreshing(true);
		setHasLoadedAllDestinationsForSearch(false);
		setAllDestinationsForSearch([]);
		destinationSearchRequestRef.current += 1;
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
	const visibleDestinations = useMemo(() => {
		const isDefaultHomeView = !searchQuery.trim() && destinationSort === "popular" && !savedOnly;
		if (!isDefaultHomeView) return filteredDestinations;
		const featuredKeys = new Set(
			featuredDestinations.map((city) => `${city.countryId}:${city.id}`)
		);
		return filteredDestinations.filter(
			(city) => !featuredKeys.has(`${city.countryId}:${city.id}`)
		);
	}, [filteredDestinations, featuredDestinations, searchQuery, destinationSort, savedOnly]);

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
		if (!hasLoadedAllDestinationsForSearch) fetchAllDestinationsForSearch("");
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
				<AppText style={styles.avatarInitial}>{profileInitial}</AppText>
			)}
		</TouchableOpacity>
	);

	const renderHeader = () => (
		<PageHeader variant="hero">

			<View style={styles.headerTop}>
				{renderProfileAvatar()}
			</View>

			<View style={styles.headlineWrap}>
				<AppText style={styles.headline}>לאן נוסעים?</AppText>
			</View>

			<SearchFilterRow
				style={styles.searchWrap}
				onFilterPress={openDestinationFilters}
				activeFilterCount={(savedOnly ? 1 : 0) + (destinationSort !== "popular" ? 1 : 0)}
				accessibilityLabel="סינון יעדים"
				filterTestID="home-filter-button"
			>
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
				/>
			</SearchFilterRow>
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
				<AppText style={preferenceStyles.promptTitle}>העדפות טיול</AppText>
				<AppText style={preferenceStyles.promptText}>בחירה קצרה תעזור לסדר את התוכן לפי מה שמעניין אותך.</AppText>
				<TouchableOpacity style={preferenceStyles.promptButton} onPress={openPreferenceSetup}>
					<AppText style={preferenceStyles.promptButtonText}>בחירת העדפות</AppText>
				</TouchableOpacity>
			</View>
		);
	};

	const renderFeaturedCard = (city, index) => {
		const gradient = DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length];
		const imageUrl = getDestinationImageUrl(city, "feed");
		const cityName = city?.identity?.names?.he || city?.names?.he || city?.name || city?.id;
		const countryName = city?.countryNames?.he || city?.identity?.countryNames?.he ||
			city?.country || city?.countryName || city?.countryId;

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
				<PhotoAttribution destination={city} />
				<View style={styles.featuredContent}>
					<AppText style={styles.featuredCity} numberOfLines={1}>
						{cityName}
					</AppText>
					<AppText style={styles.featuredCountry} numberOfLines={1}>
						{countryName}
					</AppText>
				</View>
			</TouchableOpacity>
		);
	};

	const renderFeatured = () => (
		<View style={styles.section}>
			<View style={styles.sectionHeader}>
				<TouchableOpacity activeOpacity={0.7}>
					<AppText style={styles.sectionLink}>הצג הכל</AppText>
				</TouchableOpacity>
				<AppText style={styles.sectionTitle}>מומלצים עכשיו</AppText>
			</View>
			{featuredDestinations.length === 0 ? (
				<View style={styles.loadingRow}>
					{loading ? <ActivityIndicator color={colors.navActive} /> : null}
					<AppText style={styles.statusText}>
						{loading ? "טוען יעדים..." : "אין יעדים להצגה"}
					</AppText>
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
					<AppText style={styles.sectionLink}>הצג הכל</AppText>
				</TouchableOpacity>
				<AppText style={styles.sectionTitle}>יעדים פופולריים</AppText>
			</View>

			<View style={styles.destinationGrid}>
				{loading && destinations.length === 0 ? (
					<View style={styles.fullWidthStatus}>
						<ActivityIndicator color={colors.navActive} />
						<AppText style={styles.statusText}>טוען יעדים...</AppText>
					</View>
				) : visibleDestinations.length === 0 ? (
					<AppText style={styles.emptyText} testID="home-empty-state">
						לא נמצאו יעדים
					</AppText>
				) : (
					visibleDestinations.map((city) => (
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
				testID="home-scroll"
				style={[styles.scroll, { backgroundColor: colors.heroBlueGradient[1] }]}
				contentInsetAdjustmentBehavior="never"
				automaticallyAdjustContentInsets={false}
				automaticallyAdjustsScrollIndicatorInsets={false}
				contentInset={ZERO_SCROLL_INSETS}
				scrollIndicatorInsets={ZERO_SCROLL_INSETS}
				contentOffset={ZERO_SCROLL_OFFSET}
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
