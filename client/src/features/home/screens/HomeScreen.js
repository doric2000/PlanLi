import { useEffect, useState, useCallback, useRef } from "react";
import {
	View,
	Text,
	ScrollView,
	TouchableOpacity,
	Image,
	RefreshControl,
	StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// שימו לב להוספת collectionGroup
import { getDocs, query, limit, collectionGroup } from "firebase/firestore";
import CityCard from "../../../components/CityCard";
import { db } from "../../../config/firebase";
import {
	colors,
	spacing,
	typography,
	buttons,
	shadows,
	common,
	cards,
} from "../../../styles";
import GooglePlacesInput from "../../../components/GooglePlacesInput";
import { getOrCreateDestination } from "../../../services/LocationService";
import { Ionicons } from "@expo/vector-icons";
/**
 * Landing screen for the application.
 * Displays trending destinations, popular places, and a community feed.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function HomeScreen({ navigation }) {
	const [recommendations, setRecommendations] = useState([]);
	const [destinations, setDestinations] = useState([]); // כאן נשמור את הערים
	const [allDestinationsForSearch, setAllDestinationsForSearch] = useState(
		[]
	);
	const [
		hasLoadedAllDestinationsForSearch,
		setHasLoadedAllDestinationsForSearch,
	] = useState(false);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const isFetchingAllDestinationsForSearchRef = useRef(false);
	const allDestinationsFetchDebounceRef = useRef(null);

	// Fetch popular destinations
	const fetchDestinations = async () => {
		try {
			// Query all collections named 'cities' regardless of country
			const citiesQuery = query(collectionGroup(db, "cities"), limit(10));
			const querySnapshot = await getDocs(citiesQuery);

			const citiesList = querySnapshot.docs.map((doc) => {
				// Extract Parent Country ID
				const parentCountry = doc.ref.parent.parent;
				const countryId = parentCountry ? parentCountry.id : "Unknown";

				return {
					id: doc.id,
					countryId: countryId,
					...doc.data(),
				};
			});

			setDestinations(citiesList);
		} catch (error) {
			console.error("Error fetching destinations:", error);
		} finally {
			setRefreshing(false);
		}
	};

	const fetchAllDestinationsForSearch = async () => {
		if (isFetchingAllDestinationsForSearchRef.current) return;
		isFetchingAllDestinationsForSearchRef.current = true;
		try {
			// Only used for dev-mode local search (cached once) so we can search across ALL saved cities,
			// not just the 10 displayed on the Home screen.
			const citiesQuery = query(collectionGroup(db, "cities"));
			const querySnapshot = await getDocs(citiesQuery);

			const citiesList = querySnapshot.docs.map((doc) => {
				const parentCountry = doc.ref.parent.parent;
				const countryId = parentCountry ? parentCountry.id : "Unknown";

				return {
					id: doc.id,
					countryId: countryId,
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

	// Fetch on mount
	useEffect(() => {
		fetchDestinations();
	}, []);

	// Local-first autocomplete should cover all saved cities, not only the "popular" 10.
	// We fetch once and cache it to avoid repeated large reads on every keystroke.
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

	const renderTrendingItem = (name) => (
		<View style={cards.trending} key={name}>
			<Text style={cards.trendingText}>{name}</Text>
		</View>
	);

	const searchableDestinations = searchQuery.trim()
		? hasLoadedAllDestinationsForSearch
			? allDestinationsForSearch
			: destinations
		: destinations;

	const filteredDestinations = searchableDestinations.filter((city) => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return true; // No search -> show all

		const name = (city.name || "").toLowerCase();
		// `description` is typically the formatted_address from Google (often includes the country name).
		const description = (city.description || "").toLowerCase();
		const countryId = (city.countryId || "").toLowerCase();

		// Search by city name or country name
		return (
			name.includes(q) || description.includes(q) || countryId.includes(q)
		);
	});

	const localAutocompleteResults = searchQuery.trim()
		? filteredDestinations.slice(0, 20)
		: [];

	const localResultsLoading =
		searchQuery.trim().length >= 2 && !hasLoadedAllDestinationsForSearch;

	const handleGoogleSelect = async (placeId) => {
		try {
			console.log("Selected Place ID:", placeId);
			const result = await getOrCreateDestination(placeId);
			console.log("Service Result:", result);

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
			alert("Could not load destination.");
		}
	};

	return (
		<SafeAreaView style={common.container}>
			<ScrollView
				contentContainerStyle={common.scrollContent}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						colors={[colors.primary]}
						tintColor={colors.primary}
					/>
				}
			>
				{/* Header */}
				<View style={common.homeHeader}>
					<Text style={common.homeHeaderTitle}>
						יאלללה, לאן טסים?
					</Text>
					<View style={styles.searchContainer}>
						<GooglePlacesInput
							mode='google'
							value={searchQuery}
							onChangeValue={setSearchQuery}
							localResults={localAutocompleteResults}
							localResultsLoading={localResultsLoading}
							onSelectLocal={(city) => {
								if (!city?.id || !city?.countryId) return;
								navigation.navigate("LandingPage", {
									cityId: city.id,
									countryId: city.countryId,
								});
							}}
							onSelect={handleGoogleSelect}
							googleFallbackDelayMs={2000}
						/>
					</View>
				</View>

				{/* Trending Now (Static for now) */}
				{/* <View style={common.homeSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="trending-up-outline" size={18} color={colors.textPrimary} style={{ marginRight: 8 }} />
            <Text style={common.homeSectionTitle}>Trending Now</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={common.homeHorizontalScroll}>
            {['Thailand', 'Greece', 'Iceland', 'Portugal'].map(renderTrendingItem)}
          </ScrollView>
        </View> */}

				{/* Popular Destinations - DYNAMIC FROM FIREBASE */}
				<View style={common.homeSectionm}>
					<View style={[common.homeSectionHeaderRow ,{flexDirection: 'row-reverse'}]}>
						<Text
							style={
								[common.homeSectionTitle]
							}
						>
							יעדים פופולרים
						</Text>
						{/* <TouchableOpacity><Text style={common.homeSeeAllText}>View All</Text></TouchableOpacity> */}
					</View>

					<View style={common.homeGrid}>
						{destinations.length === 0 ? (
							<Text style={common.emptyText}>
								Loading destinations...
							</Text>
						) : filteredDestinations.length === 0 ? (
							<Text style={common.emptyText}>
								No destinations match "{searchQuery}"
							</Text>
						) : (
							filteredDestinations.map((city) => (
								<CityCard
									key={city.id}
									city={city}
									onPress={() =>
										navigation.navigate("LandingPage", {
											cityId: city.id,
											countryId: city.countryId,
										})
									}
								/>
							))
						)}
					</View>
				</View>

				{/* Spacer for FAB */}
				<View style={styles.spacer} />
			</ScrollView>

			{/* Temporary button removed as we now have real cards */}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	sectionTitleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	searchContainer: {
		width: "100%",
		position: "relative",
		zIndex: 10000,
	},
	spacer: {
		height: 80,
	},
});
