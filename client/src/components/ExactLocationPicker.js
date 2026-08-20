import React, { useEffect } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import AppText from "./AppText";

import GooglePlacesInput from "./GooglePlacesInput";
import ExactLocationConfirmation from "./ExactLocationConfirmation";
import useExactPlaceSelection from "../hooks/useExactPlaceSelection";
import { colors, exactLocationPickerStyles as styles } from "../styles";

export default function ExactLocationPicker({
	value,
	onChange,
	label = "מיקום מדויק",
	placeholder = "חפש מקום / אטרקציה / מסעדה...",
	inputTestID,
	onResolvingChange,
}) {
	const {
		clearSelectionForTyping,
		chooseDestination,
		chooseAnotherLocation,
		confirmPendingLocation,
		googleSearchFn,
		handleSelectGooglePlace,
		hydrateSelection,
		locationQuery,
		locationResolveError,
		locationResolveRetryable,
		destinationChoice,
		pendingLocation,
		resolvingLocation,
		retryLocationResolution,
		selectedCity,
		selectedCountry,
		selectedPlace,
	} = useExactPlaceSelection({ value, onChange });

	useEffect(() => {
		hydrateSelection(value);
	}, [hydrateSelection, value?.cityId, value?.countryId, value?.place?.placeId]);

	useEffect(() => {
		onResolvingChange?.(resolvingLocation || !!pendingLocation || !!destinationChoice);
	}, [destinationChoice, onResolvingChange, pendingLocation, resolvingLocation]);

	const selectPlace = (selection) => handleSelectGooglePlace(selection).catch(() => {});

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
				explicitSearch
				returnSelection
				placeholder={placeholder}
				inputTestID={inputTestID}
			/>

			<ExactLocationConfirmation
				pendingLocation={pendingLocation}
				destinationChoice={destinationChoice}
				onChooseDestination={(choiceId) => chooseDestination(choiceId).catch(() => {})}
				onConfirm={confirmPendingLocation}
				onChooseAnother={chooseAnotherLocation}
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
				<View
					style={styles.errorWrap}
					accessibilityRole="alert"
					accessibilityLiveRegion="polite"
				>
					<AppText style={styles.errorText}>{locationResolveError}</AppText>
					{locationResolveRetryable ? (
						<TouchableOpacity
							style={styles.retryButton}
							onPress={() => retryLocationResolution().catch(() => {})}
							accessibilityRole="button"
							testID="exact-location-retry"
						>
							<AppText style={styles.retryText}>נסו שוב</AppText>
						</TouchableOpacity>
					) : (
						<TouchableOpacity
							style={styles.retryButton}
							onPress={chooseAnotherLocation}
							accessibilityRole="button"
							testID="exact-location-change-result"
						>
							<AppText style={styles.retryText}>בחירת תוצאה אחרת</AppText>
						</TouchableOpacity>
					)}
				</View>
			)}
		</View>
	);
}

