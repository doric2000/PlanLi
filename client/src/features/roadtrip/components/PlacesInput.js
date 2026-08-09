import { useCallback, useRef, useState } from "react";
import {
	View,
	TouchableOpacity,
	FlatList,
	ActivityIndicator,
} from "react-native";
import AppText from "../../../components/AppText";
import AppTextInput from "../../../components/AppTextInput";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, shadows, placesInputStyles as styles } from "../../../styles";

const PlaceholderColor = colors.placeholder;

/**
 * Component for inputting multiple places (cities or countries).
 * Provides autocomplete suggestions.
 *
 * @param {Object} props
 * @param {string[]} props.places - Array of place names.
 * @param {Function} props.setPlaces - Function to update the places array.
 */
export default function PlacesInput({ places, setPlaces }) {
	const [suggestions, setSuggestions] = useState({});
	const [loading, setLoading] = useState({});
	const [validatedPlaces, setValidatedPlaces] = useState({});
	const debounceTimers = useRef({});

	const addPlace = () => {
		setPlaces([...places, ""]);
		setValidatedPlaces((prev) => ({ ...prev, [places.length]: false }));
	};

	const updatePlace = (text, index) => {
		const next = [...places];
		next[index] = text;
		setPlaces(next);
	};

	const removePlace = (index) => {
		const next = [...places];
		next.splice(index, 1);
		setPlaces(next);

		const newSuggestions = { ...suggestions };
		const newValidated = { ...validatedPlaces };
		delete newSuggestions[index];
		delete newValidated[index];
		setSuggestions(newSuggestions);
		setValidatedPlaces(newValidated);

		if (debounceTimers.current[index]) {
			clearTimeout(debounceTimers.current[index]);
			delete debounceTimers.current[index];
		}
	};

	const fetchPlaces = async (query, index) => {
		if (!query || query.length < 2) {
			setSuggestions((prev) => ({ ...prev, [index]: [] }));
			setValidatedPlaces((prev) => ({ ...prev, [index]: false }));
			return;
		}

		setLoading((prev) => ({ ...prev, [index]: true }));

		try {
			// Fetch both countries and cities in parallel
			const [countriesResponse, nominatimResponse] = await Promise.all([
				fetch(`https://restcountries.com/v3.1/name/${query}`).catch(
					() => null
				),
				fetch(
					`https://nominatim.openstreetmap.org/search?city=${query}&format=json&limit=5&addressdetails=1`,
					{
						headers: {
							"User-Agent": "PlanLi-App",
						},
					}
				).catch(() => null),
			]);

			const allSuggestions = [];

			// Parse countries
			if (countriesResponse) {
				const countriesData = await countriesResponse.json();
				if (countriesData && Array.isArray(countriesData)) {
					const countries = countriesData
						.slice(0, 3)
						.map((country) => ({
							name: country.name.common,
							type: "country",
						}));
					allSuggestions.push(...countries);
				}
			}

			// Parse cities
			if (nominatimResponse) {
				const citiesData = await nominatimResponse.json();

				if (citiesData && Array.isArray(citiesData)) {
					const cities = citiesData
						.filter(
							(place) =>
								place.address &&
								(place.address.city ||
									place.address.town ||
									place.address.village)
						)
						.slice(0, 5)
						.map((place) => ({
							name: `${
								place.address.city ||
								place.address.town ||
								place.address.village
							}, ${place.address.country}`,
							type: "city",
						}));
					allSuggestions.push(...cities);
				}
			}

			setSuggestions((prev) => ({ ...prev, [index]: allSuggestions }));

			// Check if current input exactly matches any suggestion
			const isValid = allSuggestions.some(
				(place) => place.name.toLowerCase() === query.toLowerCase()
			);
			setValidatedPlaces((prev) => ({ ...prev, [index]: isValid }));
		} catch (error) {
			console.error("Error fetching places:", error);
			setSuggestions((prev) => ({ ...prev, [index]: [] }));
			setValidatedPlaces((prev) => ({ ...prev, [index]: false }));
		} finally {
			setLoading((prev) => ({ ...prev, [index]: false }));
		}
	};

	const selectPlace = (place, index) => {
		updatePlace(place.name, index);
		setSuggestions((prev) => ({ ...prev, [index]: [] }));
		setValidatedPlaces((prev) => ({ ...prev, [index]: true }));
	};

	const handleTextChange = (text, index) => {
		updatePlace(text, index);
		setValidatedPlaces((prev) => ({ ...prev, [index]: false }));

		if (debounceTimers.current[index]) {
			clearTimeout(debounceTimers.current[index]);
		}

		debounceTimers.current[index] = setTimeout(() => {
			fetchPlaces(text, index);
		}, 500);
	};

	const renderItem = ({ item, index }) => {
		const idx = index + 1;
		const hasSuggestions =
			suggestions[index] && suggestions[index].length > 0;
		const isValid = validatedPlaces[index] === true;
		const hasInput = item && item.length > 0;
		const showError =
			hasInput && !isValid && !loading[index] && !hasSuggestions;

		return (
			<View style={{ marginBottom: 8 }}>
				<View
					style={[
						styles.row,
						showError && styles.rowError,
						isValid && styles.rowValid,
					]}
				>
					<AppTextInput
						style={styles.input}
						placeholder={`עיר או מדינה ${idx}`}
						placeholderTextColor={PlaceholderColor}
						value={item}
						onChangeText={(t) => handleTextChange(t, index)}
						autoCapitalize='words'
						autoCorrect={false}
						textAlign="right"
					/>
					{loading[index] ? (
						<ActivityIndicator
							size='small'
							color={colors.info}
							style={{ marginLeft: spacing.sm }}
						/>
					) : null}
					{isValid ? <AppText style={styles.checkmark}>✓</AppText> : null}
					<TouchableOpacity
						onPress={() => removePlace(index)}
						style={styles.removeBtn}
					>
						<AppText style={styles.removeText}>×</AppText>
					</TouchableOpacity>
				</View>

				{showError ? (
					<AppText style={styles.errorText}>
						אנא בחר עיר או מדינה תקפים מהרשימה
					</AppText>
				) : null}

				{hasSuggestions ? (
					<View style={styles.suggestionsContainer}>
						{suggestions[index].map((place, i) => (
							<TouchableOpacity
								key={i}
								style={[
									styles.suggestionItem,
									i === suggestions[index].length - 1 && {
										borderBottomWidth: 0,
									},
								]}
								onPress={() => selectPlace(place, index)}
							>
								<View style={styles.suggestionContent}>
									<AppText style={styles.suggestionText}>
										{place.name}
									</AppText>
									<View style={styles.suggestionTypeRow}>
										<Ionicons
											name={place.type === "country" ? "globe-outline" : "business-outline"}
											size={12}
											color={colors.textSecondary}
											style={{ marginLeft: 6 }}
										/>
										<AppText style={styles.suggestionType}>
											{place.type === "country" ? "מדינה" : "עיר"}
										</AppText>
									</View>
								</View>
							</TouchableOpacity>
						))}
					</View>
				) : null}
			</View>
		);
	};

	// Export validation check function
	const isAllValid = () => {
		return places.every(
			(place, index) =>
				place.length === 0 || validatedPlaces[index] === true
		);
	};

	return (
		<View style={{ marginTop: 10 }}>
			<View style={styles.headerRow}>
				<AppText style={styles.label}>יעדים (ערים או מדינות)</AppText>
				<TouchableOpacity onPress={addPlace} style={styles.addBtn}>
					<AppText style={styles.addText}>＋</AppText>
				</TouchableOpacity>
			</View>
			<FlatList
				data={places}
				keyExtractor={(_, idx) => `place-${idx}`}
				renderItem={renderItem}
				scrollEnabled={false}
				nestedScrollEnabled={true}
			/>
		</View>
	);
}
