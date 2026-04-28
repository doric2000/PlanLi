import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { collection, collectionGroup, getDocs, query } from "firebase/firestore";

import GooglePlacesInput from "./GooglePlacesInput";
import SelectionModal from "../features/community/components/SelectionModal";
import { db } from "../config/firebase";
import { getOrCreateDestinationForPlace, searchPlaces } from "../services/LocationService";
import { colors, exactLocationPickerStyles as styles } from "../styles";

const getInitialQuery = (value) =>
	value?.place?.name || value?.place?.address || value?.location || "";

const buildValue = (country, city, place) => {
	if (!country?.id || !city?.id) return null;
	return {
		location: city.name || city.id,
		country: country.name || country.id,
		countryId: country.id,
		cityId: city.id,
		place: place || null,
	};
};

export default function ExactLocationPicker({
	value,
	onChange,
	label = "מיקום מדויק",
	placeholder = "חפש מקום / אטרקציה / מסעדה...",
	inputTestID,
}) {
	const [locationQuery, setLocationQuery] = useState(getInitialQuery(value));
	const [selectedCountry, setSelectedCountry] = useState(null);
	const [selectedCity, setSelectedCity] = useState(null);
	const [selectedPlace, setSelectedPlace] = useState(null);
	const [locationResolveError, setLocationResolveError] = useState(null);
	const [resolvingLocation, setResolvingLocation] = useState(false);

	const [allCitiesForSearch, setAllCitiesForSearch] = useState([]);
	const [hasLoadedAllCitiesForSearch, setHasLoadedAllCitiesForSearch] = useState(false);
	const isFetchingAllCitiesForSearchRef = useRef(false);
	const allCitiesFetchDebounceRef = useRef(null);

	const [countryPickerVisible, setCountryPickerVisible] = useState(false);
	const [countriesForPicker, setCountriesForPicker] = useState([]);
	const [loadingCountriesForPicker, setLoadingCountriesForPicker] = useState(false);
	const [pendingCountryOverridePlaceId, setPendingCountryOverridePlaceId] = useState(null);
	const [suggestedCountryForOverride, setSuggestedCountryForOverride] = useState(null);

	useEffect(() => {
		setLocationQuery(getInitialQuery(value));
		setSelectedCountry(value?.countryId ? { id: value.countryId, name: value.country || value.countryId } : null);
		setSelectedCity(value?.cityId ? { id: value.cityId, name: value.location || value.cityId } : null);
		setSelectedPlace(value?.place || null);
		setLocationResolveError(null);
		setPendingCountryOverridePlaceId(null);
		setSuggestedCountryForOverride(null);
	}, [value?.cityId, value?.countryId, value?.place?.placeId]);

	useEffect(() => {
		const q = locationQuery.trim();
		if (q.length < 2) return;
		if (hasLoadedAllCitiesForSearch) return;
		if (isFetchingAllCitiesForSearchRef.current) return;

		if (allCitiesFetchDebounceRef.current) {
			clearTimeout(allCitiesFetchDebounceRef.current);
		}

		allCitiesFetchDebounceRef.current = setTimeout(async () => {
			isFetchingAllCitiesForSearchRef.current = true;
			try {
				const citiesQuery = query(collectionGroup(db, "cities"));
				const querySnapshot = await getDocs(citiesQuery);
				const citiesList = querySnapshot.docs.map((cityDoc) => {
					const parentCountry = cityDoc.ref.parent.parent;
					const countryId = parentCountry ? parentCountry.id : "Unknown";
					return {
						id: cityDoc.id,
						countryId,
						...cityDoc.data(),
					};
				});
				setAllCitiesForSearch(citiesList);
				setHasLoadedAllCitiesForSearch(true);
			} catch (error) {
				console.error("Error fetching all cities for search:", error);
			} finally {
				isFetchingAllCitiesForSearchRef.current = false;
			}
		}, 400);

		return () => {
			if (allCitiesFetchDebounceRef.current) {
				clearTimeout(allCitiesFetchDebounceRef.current);
				allCitiesFetchDebounceRef.current = null;
			}
		};
	}, [locationQuery, hasLoadedAllCitiesForSearch]);

	const localAutocompleteResults = useMemo(() => {
		const q = locationQuery.trim().toLowerCase();
		if (!q) return [];
		return (hasLoadedAllCitiesForSearch ? allCitiesForSearch : [])
			.filter((city) => {
				const name = (city.name || "").toLowerCase();
				const description = (city.description || "").toLowerCase();
				const countryId = (city.countryId || "").toLowerCase();
				return name.includes(q) || description.includes(q) || countryId.includes(q);
			})
			.slice(0, 20);
	}, [allCitiesForSearch, hasLoadedAllCitiesForSearch, locationQuery]);

	const localResultsLoading = locationQuery.trim().length >= 2 && !hasLoadedAllCitiesForSearch;

	const emitSelection = (country, city, place) => {
		onChange?.(buildValue(country, city, place));
	};

	const clearSelectionForTyping = (text) => {
		setLocationQuery(text);
		setSelectedCountry(null);
		setSelectedCity(null);
		setSelectedPlace(null);
		setLocationResolveError(null);
		setPendingCountryOverridePlaceId(null);
		setSuggestedCountryForOverride(null);
		onChange?.(null);
	};

	const handleSelectLocalCity = (city) => {
		if (!city?.id || !city?.countryId) return;
		const nextCountry = { id: city.countryId, name: city.country || city.countryName || city.countryId };
		const nextCity = { id: city.id, name: city.name || city.id };
		const nextPlace = {
			placeId: city.googlePlaceId || null,
			name: city.name || null,
			address: city.description || null,
			...(city.coordinates ? { coordinates: city.coordinates } : {}),
		};
		setLocationResolveError(null);
		setSelectedCountry(nextCountry);
		setSelectedCity(nextCity);
		setSelectedPlace(nextPlace);
		emitSelection(nextCountry, nextCity, nextPlace);
	};

	const handleSelectGooglePlace = async (placeId) => {
		setResolvingLocation(true);
		setLocationResolveError(null);
		try {
			const result = await getOrCreateDestinationForPlace(placeId);
			setSelectedCountry(result.destination.country);
			setSelectedCity(result.destination.city);
			setSelectedPlace(result.place);
			emitSelection(result.destination.country, result.destination.city, result.place);
		} catch (error) {
			if (error?.code !== "MISSING_COUNTRY" && error?.code !== "DISPUTED_COUNTRY") {
				console.error(error);
			}
			if ((error?.code === "MISSING_COUNTRY" || error?.code === "DISPUTED_COUNTRY") && error?.parsed) {
				const parsed = error.parsed;
				setPendingCountryOverridePlaceId(placeId);
				setSuggestedCountryForOverride(error?.suggestedCountry || null);
				setSelectedCountry(null);
				setSelectedCity(parsed?.cityName ? { id: parsed.cityName, name: parsed.cityName } : null);
				setSelectedPlace({
					placeId: parsed.placeId,
					name: parsed.name,
					address: parsed.address,
					url: parsed.url,
					...(parsed.coordinates ? { coordinates: parsed.coordinates } : {}),
				});
				onChange?.(null);

				setLocationResolveError(
					error?.code === "DISPUTED_COUNTRY"
						? "המדינה שזוהתה אוטומטית לא חד-משמעית."
						: "חסרה מדינה עבור המקום שנבחר."
				);
				Alert.alert(
					"צריך לבחור מדינה",
					"בחר מדינה ידנית כדי לשמור את המיקום.",
					[
						{ text: "ביטול", style: "cancel" },
						...(error?.code === "DISPUTED_COUNTRY" && error?.suggestedCountry?.name
							? [
								{
									text: `השתמש ב-${error.suggestedCountry.name}`,
									onPress: () => {
										handleSelectManualCountry({
											id: error.suggestedCountry.name,
											name: error.suggestedCountry.name,
											code: error.suggestedCountry.code || null,
										});
									},
								},
							]
							: []),
						{
							text: "בחר מדינה",
							onPress: () => setCountryPickerVisible(true),
						},
					]
				);
			} else {
				setSelectedCountry(null);
				setSelectedCity(null);
				setSelectedPlace(null);
				onChange?.(null);
				const message = error?.message || "לא הצלחנו לטעון את פרטי המקום.";
				setLocationResolveError(message);
				Alert.alert("שגיאת מיקום", "נסה לבחור מקום אחר או עיר קרובה.");
			}
		} finally {
			setResolvingLocation(false);
		}
	};

	const loadCountriesForPicker = async () => {
		if (loadingCountriesForPicker) return;
		if (countriesForPicker.length > 0) return;

		setLoadingCountriesForPicker(true);
		try {
			const snap = await getDocs(collection(db, "countries"));
			const list = snap.docs
				.map((d) => ({ id: d.id, ...(d.data() || {}) }))
				.map((c) => ({
					id: c.id,
					name: c.name || c.id,
					code: c.code || null,
				}))
				.filter((c) => c.id);

			list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "he"));
			setCountriesForPicker(list);
		} catch (e) {
			console.error("Failed to load countries for picker:", e);
			Alert.alert("שגיאה", "לא הצלחנו לטעון את רשימת המדינות.");
		} finally {
			setLoadingCountriesForPicker(false);
		}
	};

	useEffect(() => {
		if (countryPickerVisible) {
			loadCountriesForPicker();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [countryPickerVisible]);

	const handleSelectManualCountry = async (country) => {
		const placeId = pendingCountryOverridePlaceId || selectedPlace?.placeId;
		if (!placeId) {
			setCountryPickerVisible(false);
			return;
		}

		setCountryPickerVisible(false);
		setResolvingLocation(true);
		setLocationResolveError(null);

		try {
			const result = await getOrCreateDestinationForPlace(placeId, {
				countryOverride: { name: country?.name || country?.id, code: country?.code || null },
			});
			setSelectedCountry(result.destination.country);
			setSelectedCity(result.destination.city);
			setSelectedPlace(result.place);
			setPendingCountryOverridePlaceId(null);
			setSuggestedCountryForOverride(null);
			emitSelection(result.destination.country, result.destination.city, result.place);
		} catch (e) {
			console.error(e);
			setSelectedCountry(null);
			onChange?.(null);
			setLocationResolveError(e?.message || "לא הצלחנו לשמור את המדינה שנבחרה.");
			Alert.alert("שגיאה", "לא הצלחנו לשמור את המדינה שנבחרה. נסה לבחור מדינה אחרת.");
		} finally {
			setResolvingLocation(false);
		}
	};

	const selectedLabel = [selectedPlace?.name, selectedCity?.name, selectedCountry?.name]
		.filter(Boolean)
		.join(" · ");

	return (
		<View style={styles.wrap}>
			{!!label && <Text style={styles.label}>{label}</Text>}
			<GooglePlacesInput
				mode="google"
				value={locationQuery}
				onChangeValue={clearSelectionForTyping}
				localResults={localAutocompleteResults}
				localResultsLoading={localResultsLoading}
				onSelectLocal={handleSelectLocalCity}
				onSelect={handleSelectGooglePlace}
				googleFallbackDelayMs={2000}
				googleSearchFn={(text, opts) => searchPlaces(text, { ...opts, types: "all" })}
				placeholder={placeholder}
				inputTestID={inputTestID}
			/>

			{resolvingLocation && (
				<View style={styles.statusRow}>
					<ActivityIndicator size="small" color={colors.primary} />
					<Text style={styles.statusText}>טוען פרטי מיקום...</Text>
				</View>
			)}

			{!!selectedLabel && !locationResolveError && (
				<Text style={styles.selectedText} numberOfLines={2}>
					{selectedLabel}
				</Text>
			)}

			{!!locationResolveError && (
				<View style={styles.errorWrap}>
					<Text style={styles.errorText}>{locationResolveError}</Text>
					{!!(pendingCountryOverridePlaceId || selectedPlace?.placeId) && !selectedCountry?.id && (
						<TouchableOpacity onPress={() => setCountryPickerVisible(true)} activeOpacity={0.85}>
							<Text style={styles.manualCountryText}>בחר מדינה ידנית</Text>
						</TouchableOpacity>
					)}
				</View>
			)}

			{!!(selectedPlace?.placeId && selectedCountry?.id) && (
				<TouchableOpacity
					onPress={() => {
						setPendingCountryOverridePlaceId(selectedPlace.placeId);
						setCountryPickerVisible(true);
					}}
					activeOpacity={0.85}
					style={styles.changeCountryButton}
				>
					<Text style={styles.changeCountryText}>שנה מדינה</Text>
				</TouchableOpacity>
			)}

			<SelectionModal
				visible={countryPickerVisible}
				onClose={() => setCountryPickerVisible(false)}
				title={loadingCountriesForPicker ? "טוען מדינות..." : "בחר מדינה"}
				data={countriesForPicker}
				onSelect={handleSelectManualCountry}
				selectedId={selectedCountry?.id || suggestedCountryForOverride?.name}
				emptyText={loadingCountriesForPicker ? "טוען..." : "אין מדינות להצגה"}
			/>
		</View>
	);
}

