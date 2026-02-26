import { useState, useCallback, useRef } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	FlatList,
	ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, shadows } from "../../../styles";

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
					<TextInput
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
					{isValid ? <Text style={styles.checkmark}>✓</Text> : null}
					<TouchableOpacity
						onPress={() => removePlace(index)}
						style={styles.removeBtn}
					>
						<Text style={styles.removeText}>×</Text>
					</TouchableOpacity>
				</View>

				{showError ? (
					<Text style={styles.errorText}>
						אנא בחר עיר או מדינה תקפים מהרשימה
					</Text>
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
									<Text style={styles.suggestionText}>
										{place.name}
									</Text>
									<View style={styles.suggestionTypeRow}>
										<Ionicons
											name={place.type === "country" ? "globe-outline" : "business-outline"}
											size={12}
											color={colors.textSecondary}
											style={{ marginLeft: 6 }}
										/>
										<Text style={styles.suggestionType}>
											{place.type === "country" ? "מדינה" : "עיר"}
										</Text>
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
				<Text style={styles.label}>יעדים (ערים או מדינות)</Text>
				<TouchableOpacity onPress={addPlace} style={styles.addBtn}>
					<Text style={styles.addText}>＋</Text>
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

const styles = StyleSheet.create({
	headerRow: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: spacing.sm,
	},
	label: { ...typography.label, color: colors.textPrimary, textAlign: "right" },
	addBtn: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 12,
		backgroundColor: colors.infoLight,
	},
	addText: { color: colors.info, fontSize: 16, fontWeight: "700" },
	row: {
		flexDirection: "row-reverse",
		alignItems: "center",
		backgroundColor: colors.background,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	rowError: {
		borderColor: colors.error,
		backgroundColor: colors.errorLight,
	},
	rowValid: {
		borderColor: colors.success,
		backgroundColor: colors.successLight,
	},
	input: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 6, textAlign: "right" },
	removeBtn: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: colors.errorLight,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: spacing.sm,
	},
	removeText: { color: colors.error, fontSize: 18, fontWeight: "700" },
	checkmark: {
		color: colors.success,
		fontSize: 18,
		fontWeight: "700",
		marginLeft: spacing.sm,
	},
	errorText: {
		color: colors.error,
		fontSize: 12,
		marginTop: 4,
		marginRight: 4,
		textAlign: "right",
	},
	suggestionsContainer: {
		backgroundColor: colors.white,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.border,
		marginTop: 4,
		...shadows.small,
	},
	suggestionItem: {
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	suggestionContent: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
	},
	suggestionText: {
		fontSize: 14,
		color: colors.textPrimary,
		flex: 1,
		textAlign: "right",
	},
	suggestionType: {
		fontSize: 11,
		color: colors.textSecondary,
		marginLeft: spacing.sm,
	},
	suggestionTypeRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
		marginRight: spacing.sm,
	},
});
