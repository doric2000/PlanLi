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
import RtlHorizontalScrollView from "../../../components/RtlHorizontalScrollView";
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
import { useAuth } from "../../auth/AuthContext";
import { CAPABILITIES } from "../../../constants/authPolicy";
import { useFavoriteCityIds } from "../../../hooks/useFavoriteCityIds";
import { useSmartProfile } from "../../../hooks/useSmartProfile";
import { useTabPressScrollOrRefresh } from "../../../hooks/useTabPressScrollOrRefresh";
import { resolveDestinationForPlacePreview } from "../../../services/LocationService";
import {
	destinationCatalogItemToCity,
	searchDestinations,
} from "../../../services/DestinationService";
import { colors, homeScreenStyles as styles, preferenceSetupStyles as preferenceStyles } from "../../../styles";
import {
	compactDestinationText,
	filterAndSortDestinations,
	mergeDestinations,
} from "../../../utils/destinationSearch";
import { getDestinationImageUrl } from "../../../utils/destinationImages";
import {
	loadRecentDiscoveryDestinations,
	rememberDiscoveryDestinations,
} from "../../../utils/recentDiscoveryDestinations";

const DESTINATION_GRADIENTS = [
	["#78909C", "#546E7A"],
	["#90A4AE", "#607D8B"],
	["#8295A3", "#526878"],
];

const ZERO_SCROLL_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const ZERO_SCROLL_OFFSET = { x: 0, y: 0 };

function recentDestinationToCity(destination) {
	if (!destination?.countryId || !destination?.cityId) return null;
	return {
		id: destination.cityId,
		cityId: destination.cityId,
		countryId: destination.countryId,
		name: destination.name || destination.label || destination.cityId,
		description: destination.countryName || "",
		countryName: destination.countryName || "",
		label: destination.label,
	};
}

function cityToRecentDestination(city) {
	const cityId = city?.cityId || city?.id;
	if (!city?.countryId || !cityId) return null;
	const name = city?.identity?.names?.he || city?.names?.he || city?.name || cityId;
	const countryName = city?.countryNames?.he || city?.countryName || city?.description || city.countryId;
	return {
		countryId: city.countryId,
		cityId,
		name,
		countryName,
		label: [name, countryName].filter(Boolean).join(" · "),
	};
}

export default function HomeScreen({ navigation }) {
	const insets = useSafeAreaInsets();
	const isFocused = useIsFocused();
	const { user, isGuest } = useAuthUser();
	const { ensureCapability, handleCallableAuthError } = useAuth();
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
	const [recentDestinations, setRecentDestinations] = useState([]);
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
		if (!isFocused) return undefined;
		let active = true;
		loadRecentDiscoveryDestinations().then((items) => {
			if (!active) return;
			setRecentDestinations(items.map(recentDestinationToCity).filter(Boolean));
		});
		return () => {
			active = false;
		};
	}, [isFocused]);

	useEffect(() => {
		const q = searchQuery.trim();
		if (compactDestinationText(q).length < 2) {
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
		compactDestinationText(searchQuery).length >= 2 && !hasLoadedAllDestinationsForSearch;

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

	const rememberHomeDestination = (city) => {
		const entry = cityToRecentDestination(city);
		if (!entry) return;
		setRecentDestinations((current) => {
			const nextCity = recentDestinationToCity(entry);
			return [
				nextCity,
				...current.filter((item) => (
					`${item.countryId}:${item.id}` !== `${nextCity.countryId}:${nextCity.id}`
				)),
			].slice(0, 5);
		});
		rememberDiscoveryDestinations([entry]).then((items) => {
			setRecentDestinations(items.map(recentDestinationToCity).filter(Boolean));
		}).catch(() => {});
	};

	const handleGoogleSelect = async (placeId) => {
		try {
			if (!await ensureCapability(CAPABILITIES.ACTIVE, { name: 'Main' })) return;
			const result = await resolveDestinationForPlacePreview(placeId);
			if (result?.persisted) {
				rememberHomeDestination({
					...result.destination.city,
					countryId: result.destination.country.id,
					countryName: result.destination.country.name,
				});
				setSearchQuery("");
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

	const selectLocalDestination = (city) => {
		rememberHomeDestination(city);
		setSearchQuery("");
		goToDestination(city);
	};

	const openDestinationFilters = () => {
		setDestinationFilterVisible(true);
		if (!hasLoadedAllDestinationsForSearch) fetchAllDestinationsForSearch("");
	};

	const toggleCityFavorite = async (city) => {
		if (!await ensureCapability(CAPABILITIES.ACTIVE, { name: 'Main' })) return;
		try {
			await favoriteCities.toggleFavorite(city);
				} 
		catch (error) {
		if (handleCallableAuthError(error, { name: 'Main' })) return;

		console.error('Failed to toggle destination favorite:', error);
		Alert.alert('שגיאה', 'לא הצלחנו לעדכן את המועדפים. נסו שוב.');
		}
	};

	const renderHeader = () => (
		<PageHeader
			variant="hero"
			allowOverflow
			style={styles.headerLayer}
			testID="home-tab-header"
		>
			<View style={styles.headerTitleRow} testID="home-header-title-row">
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
					idleLocalResults={recentDestinations}
					idleLocalTitle="חיפושים אחרונים"
					localResultsLoading={localResultsLoading}
					inputTestID="home-search-input"
					placeholder="חפש עיר או יעד..."
					onSelectLocal={selectLocalDestination}
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
				<RtlHorizontalScrollView
					contentContainerStyle={styles.featuredContentScroll}
				>
					{featuredDestinations.map(renderFeaturedCard)}
				</RtlHorizontalScrollView>
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
