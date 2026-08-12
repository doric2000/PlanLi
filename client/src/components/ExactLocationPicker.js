import React, { useEffect } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import AppText from "./AppText";

import GooglePlacesInput from "./GooglePlacesInput";
import useExactPlaceSelection from "../hooks/useExactPlaceSelection";
import { colors, exactLocationPickerStyles as styles } from "../styles";

export default function ExactLocationPicker({
	value,
	onChange,
	label = "מיקום מדויק",
	placeholder = "חפש מקום / אטרקציה / מסעדה...",
	inputTestID,
}) {
	const {
		clearSelectionForTyping,
		googleSearchFn,
		handleSelectGooglePlace,
		hydrateSelection,
		locationQuery,
		locationResolveError,
		resolvingLocation,
		selectedCity,
		selectedCountry,
		selectedPlace,
	} = useExactPlaceSelection({ value, onChange });

	useEffect(() => {
		hydrateSelection(value);
	}, [hydrateSelection, value?.cityId, value?.countryId, value?.place?.placeId]);

	const selectPlace = (placeId) => handleSelectGooglePlace(placeId).catch((error) => {
		console.error(error);
		Alert.alert("שגיאת מיקום", error?.userMessage || "לא הצלחנו לאמת את המיקום.");
	});

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
				onSelect={selectPlace}
				googleSearchFn={googleSearchFn}
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

