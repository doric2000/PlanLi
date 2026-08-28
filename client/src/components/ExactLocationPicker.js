import React, { useEffect } from "react";
import { TouchableOpacity, View } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import AppText from "./AppText";

import GooglePlacesInput from "./GooglePlacesInput";
import ExactLocationConfirmation from "./ExactLocationConfirmation";
import useExactPlaceSelection from "../hooks/useExactPlaceSelection";
import {
	colors,
	exactLocationPickerStyles as styles,
	recommendationComposerStyles as composer,
} from "../styles";
import { locationCopy } from '../utils/locationCopy';

export default function ExactLocationPicker({
	value,
	onChange,
	label,
	placeholder,
	inputTestID,
	onResolvingChange,
	locale = 'he',
	variant = 'default',
	helper = '',
	showSelectedCard = false,
	selectedTestID = 'exact-location-selected',
	changeTestID = 'exact-location-change',
	errorTestID = 'exact-location-error',
	retryTestID = 'exact-location-retry',
	changeResultTestID = 'exact-location-change-result',
	preferredDestination = null,
}) {
	const copy = locationCopy(locale);
	const composerVariant = variant === 'composer';
	const resolvedLabel = label === undefined ? copy.exactLocationLabel : label;
	const resolvedPlaceholder = placeholder || copy.exactLocationPlaceholder;
	const {
		clearSelectionForTyping,
		chooseDestination,
		chooseFallbackDestination,
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
		resolvingPreview,
		resolvingLocation,
		retryLocationResolution,
		selectedCity,
		selectedCountry,
		selectedPlace,
	} = useExactPlaceSelection({ value, onChange, locale, preferredDestination });

	useEffect(() => {
		hydrateSelection(value);
	}, [
		hydrateSelection,
		value?.city?.googlePlaceId,
		value?.city?.id,
		value?.city?.providerPlaceId,
		value?.cityId,
		value?.countryId,
		value?.destination?.providerPlaceId,
		value?.destinationProviderPlaceId,
		value?.place?.placeId,
	]);

	useEffect(() => {
		onResolvingChange?.(resolvingLocation || !!pendingLocation || !!destinationChoice);
	}, [destinationChoice, onResolvingChange, pendingLocation, resolvingLocation]);
	useEffect(() => () => onResolvingChange?.(false), [onResolvingChange]);

	const selectPlace = (selection) => handleSelectGooglePlace(selection).catch(() => {});
	const changeSelection = () => clearSelectionForTyping('');

	const selectedLabel = [selectedPlace?.name, selectedCity?.name, selectedCountry?.name]
		.filter(Boolean)
		.join(" · ");

	return (
		<View style={composerVariant ? composer.locationPanel : styles.wrap}>
			{!!resolvedLabel && <AppText style={composerVariant ? composer.fieldLabel : styles.label}>{resolvedLabel}</AppText>}
			{!!helper && <AppText style={composer.fieldHint}>{helper}</AppText>}
			{composerVariant && showSelectedCard && selectedPlace?.placeId ? (
				<View style={composer.selectedDestination} testID={selectedTestID}>
					<View style={composer.selectedDestinationIcon}>
						<Ionicons name="location" size={20} color={colors.primary} />
					</View>
					<View style={composer.selectedDestinationCopy}>
						<AppText style={composer.selectedDestinationTitle}>{selectedPlace.name || selectedPlace.address}</AppText>
						<AppText style={composer.selectedDestinationSubtitle}>
							{[selectedCity?.name, selectedCountry?.name].filter(Boolean).join(', ')}
						</AppText>
					</View>
					<TouchableOpacity
						onPress={changeSelection}
						accessibilityRole="button"
						accessibilityLabel="בחירת מקום אחר"
						testID={changeTestID}
					>
						<AppText style={composer.textAction}>שינוי</AppText>
					</TouchableOpacity>
				</View>
			) : <GooglePlacesInput
				mode="google"
				value={locationQuery}
				onChangeValue={clearSelectionForTyping}
				onSelect={selectPlace}
				googleSearchFn={googleSearchFn}
				explicitSearch
				variant="form"
				error={Boolean(locationResolveError)}
				returnSelection
				clearPlaceholderOnFocus={composerVariant}
				placeholder={resolvedPlaceholder}
				inputTestID={inputTestID}
				locale={locale}
			/>}

			<ExactLocationConfirmation
				pendingLocation={pendingLocation}
				destinationChoice={destinationChoice}
				resolving={resolvingLocation}
				resolvingPreview={resolvingPreview}
				onChooseDestination={(choiceId) => chooseDestination(choiceId).catch(() => {})}
				onChooseFallbackDestination={chooseFallbackDestination}
				onConfirm={confirmPendingLocation}
					onChooseAnother={chooseAnotherLocation}
				locale={locale}
			/>

			{composerVariant && resolvingLocation ? <AppText style={composer.fieldHint}>{copy.resolving}</AppText> : null}

			{!!selectedLabel && !locationResolveError && !composerVariant && (
				<AppText style={styles.selectedText} numberOfLines={2}>
					{selectedLabel}
				</AppText>
			)}

			{!!locationResolveError && composerVariant && (
				<View accessibilityRole="alert" accessibilityLiveRegion="polite">
					<AppText style={composer.fieldError} testID={errorTestID}>{locationResolveError}</AppText>
					<TouchableOpacity
						style={composer.moreButton}
						onPress={() => (locationResolveRetryable
							? retryLocationResolution().catch(() => {})
							: chooseAnotherLocation())}
						accessibilityRole="button"
						testID={locationResolveRetryable ? retryTestID : changeResultTestID}
					>
						<AppText style={composer.moreText}>{locationResolveRetryable ? copy.retry : copy.chooseAnother}</AppText>
					</TouchableOpacity>
				</View>
			)}

			{!!locationResolveError && !composerVariant && (
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
							testID={retryTestID}
						>
							<AppText style={styles.retryText}>{copy.retry}</AppText>
						</TouchableOpacity>
					) : (
						<TouchableOpacity
							style={styles.retryButton}
							onPress={chooseAnotherLocation}
							accessibilityRole="button"
							testID={changeResultTestID}
						>
							<AppText style={styles.retryText}>{copy.chooseAnother}</AppText>
						</TouchableOpacity>
					)}
				</View>
			)}
		</View>
	);
}

