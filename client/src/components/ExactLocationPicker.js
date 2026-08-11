import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import AppText from "./AppText";

import GooglePlacesInput from "./GooglePlacesInput";
import { resolveDestinationForPlacePreview, searchPlaces } from "../services/LocationService";
import {
	destinationCatalogItemToCity,
	searchDestinations,
} from "../services/DestinationService";
import { colors, exactLocationPickerStyles as styles } from "../styles";
import { locationErrorMessage } from "../utils/locationErrors";

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
	const citiesSearchRequestRef = useRef(0);
	const allCitiesFetchDebounceRef = useRef(null);

	useEffect(() => {
		setLocationQuery(getInitialQuery(value));
		setSelectedCountry(value?.countryId ? { id: value.countryId, name: value.country || value.countryId } : null);
		setSelectedCity(value?.cityId ? { id: value.cityId, name: value.location || value.cityId } : null);
		setSelectedPlace(value?.place || null);
		setLocationResolveError(null);
	}, [value?.cityId, value?.countryId, value?.place?.placeId]);

	useEffect(() => {
		const q = locationQuery.trim();
		const requestId = citiesSearchRequestRef.current + 1;
		citiesSearchRequestRef.current = requestId;
		if (q.length < 2) {
			setAllCitiesForSearch([]);
			setHasLoadedAllCitiesForSearch(false);
			return undefined;
		}
		setHasLoadedAllCitiesForSearch(false);

		if (allCitiesFetchDebounceRef.current) {
			clearTimeout(allCitiesFetchDebounceRef.current);
		}

		allCitiesFetchDebounceRef.current = setTimeout(async () => {
			try {
				const catalog = await searchDestinations({ query: q, sort: "popular", limit: 20 });
				if (citiesSearchRequestRef.current !== requestId) return;
				const citiesList = (catalog?.items || []).map((item) =>
					destinationCatalogItemToCity(item)
				);
				setAllCitiesForSearch(citiesList);
			} catch (error) {
				if (citiesSearchRequestRef.current !== requestId) return;
				console.error("Error fetching all cities for search:", error);
			} finally {
				if (citiesSearchRequestRef.current === requestId) {
					setHasLoadedAllCitiesForSearch(true);
				}
			}
		}, 400);

		return () => {
			if (allCitiesFetchDebounceRef.current) {
				clearTimeout(allCitiesFetchDebounceRef.current);
				allCitiesFetchDebounceRef.current = null;
			}
		};
	}, [locationQuery]);

	const localAutocompleteResults = useMemo(() => {
		const q = locationQuery.trim().toLowerCase();
		if (!q) return [];
		return (hasLoadedAllCitiesForSearch ? allCitiesForSearch : [])
			.filter((city) => {
				const fields = [
					city.name,
					city.names?.en,
					city.description,
					city.countryNames?.he,
					city.countryNames?.en,
					city.countryId,
				].map((field) => String(field || "").toLowerCase());
				return fields.some((field) => field.includes(q));
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
			const result = await resolveDestinationForPlacePreview(placeId);
			setSelectedCountry(result.destination.country);
			setSelectedCity(result.destination.city);
			setSelectedPlace(result.place);
			emitSelection(result.destination.country, result.destination.city, result.place);
		} catch (error) {
			console.error(error);
			setSelectedCountry(null);
			setSelectedCity(null);
			setSelectedPlace(null);
			onChange?.(null);
			const message = locationErrorMessage(error);
			setLocationResolveError(message);
			Alert.alert("שגיאת מיקום", message);
		} finally {
			setResolvingLocation(false);
		}
	};

	const selectedLabel = [selectedPlace?.name, selectedCity?.name, selectedCountry?.name]
		.filter(Boolean)
		.join(" · ");

	return (
		<View style={styles.wrap}>
			{!!label && <AppText style={styles.label}>{label}</AppText>}
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
					<AppText style={styles.statusText}>טוען פרטי מיקום...</AppText>
				</View>
			)}

			{!!selectedLabel && !locationResolveError && (
				<AppText style={styles.selectedText} numberOfLines={2}>
					{selectedLabel}
				</AppText>
			)}

			{!!locationResolveError && (
				<View style={styles.errorWrap}>
					<AppText style={styles.errorText}>{locationResolveError}</AppText>
				</View>
			)}
		</View>
	);
}

