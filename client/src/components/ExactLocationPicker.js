import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import AppText from "./AppText";

import GooglePlacesInput from "./GooglePlacesInput";
import { resolveDestinationForPlacePreview, searchPlaces } from "../services/LocationService";
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
	const resolutionGenerationRef = useRef(0);

	useEffect(() => {
		setLocationQuery(getInitialQuery(value));
		setSelectedCountry(value?.countryId ? { id: value.countryId, name: value.country || value.countryId } : null);
		setSelectedCity(value?.cityId ? { id: value.cityId, name: value.location || value.cityId } : null);
		setSelectedPlace(value?.place || null);
		setLocationResolveError(null);
	}, [value?.cityId, value?.countryId, value?.place?.placeId]);

	const emitSelection = (country, city, place) => {
		onChange?.(buildValue(country, city, place));
	};

	const clearSelectionForTyping = (text) => {
		resolutionGenerationRef.current += 1;
		setLocationQuery(text);
		setSelectedCountry(null);
		setSelectedCity(null);
		setSelectedPlace(null);
		setLocationResolveError(null);
		onChange?.(null);
	};

	const handleSelectGooglePlace = async (placeId) => {
		const generation = ++resolutionGenerationRef.current;
		setResolvingLocation(true);
		setLocationResolveError(null);
		try {
			const result = await resolveDestinationForPlacePreview(placeId);
			if (generation !== resolutionGenerationRef.current) return;
			setSelectedCountry(result.destination.country);
			setSelectedCity(result.destination.city);
			setSelectedPlace(result.place);
			emitSelection(result.destination.country, result.destination.city, result.place);
		} catch (error) {
			if (generation !== resolutionGenerationRef.current) return;
			console.error(error);
			setSelectedCountry(null);
			setSelectedCity(null);
			setSelectedPlace(null);
			onChange?.(null);
			const message = locationErrorMessage(error);
			setLocationResolveError(message);
			Alert.alert("שגיאת מיקום", message);
		} finally {
			if (generation === resolutionGenerationRef.current) setResolvingLocation(false);
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
				onSelect={handleSelectGooglePlace}
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

