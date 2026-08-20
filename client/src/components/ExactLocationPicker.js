import React, { useEffect } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import AppText from "./AppText";

import GooglePlacesInput from "./GooglePlacesInput";
import ExactLocationConfirmation from "./ExactLocationConfirmation";
import useExactPlaceSelection from "../hooks/useExactPlaceSelection";
import { colors, exactLocationPickerStyles as styles } from "../styles";
import { locationCopy } from '../utils/locationCopy';

export default function ExactLocationPicker({
	value,
	onChange,
	label,
	placeholder,
	inputTestID,
	onResolvingChange,
	locale = 'he',
}) {
	const copy = locationCopy(locale);
	const resolvedLabel = label === undefined ? copy.exactLocationLabel : label;
	const resolvedPlaceholder = placeholder || copy.exactLocationPlaceholder;
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
	} = useExactPlaceSelection({ value, onChange, locale });

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
			{!!resolvedLabel && <AppText style={styles.label}>{resolvedLabel}</AppText>}
			<GooglePlacesInput
				mode="google"
				value={locationQuery}
				onChangeValue={clearSelectionForTyping}
				onSelect={selectPlace}
				googleSearchFn={googleSearchFn}
				explicitSearch
				returnSelection
				placeholder={resolvedPlaceholder}
				inputTestID={inputTestID}
				locale={locale}
			/>

			<ExactLocationConfirmation
				pendingLocation={pendingLocation}
				destinationChoice={destinationChoice}
				onChooseDestination={(choiceId) => chooseDestination(choiceId).catch(() => {})}
				onConfirm={confirmPendingLocation}
					onChooseAnother={chooseAnotherLocation}
				locale={locale}
			/>

			{resolvingLocation && (
				<View style={styles.statusRow}>
					<ActivityIndicator size="small" color={colors.primary} />
					<AppText style={styles.statusText}>{copy.resolving}</AppText>
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
							<AppText style={styles.retryText}>{copy.retry}</AppText>
						</TouchableOpacity>
					) : (
						<TouchableOpacity
							style={styles.retryButton}
							onPress={chooseAnotherLocation}
							accessibilityRole="button"
							testID="exact-location-change-result"
						>
							<AppText style={styles.retryText}>{copy.chooseAnother}</AppText>
						</TouchableOpacity>
					)}
				</View>
			)}
		</View>
	);
}

