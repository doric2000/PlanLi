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

const PlaceholderColor = "#9CA3AF";

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
						placeholder={`City or Country ${idx}`}
						placeholderTextColor={PlaceholderColor}
						value={item}
						onChangeText={(t) => handleTextChange(t, index)}
						autoCapitalize='words'
						autoCorrect={false}
					/>
					{loading[index] ? (
						<ActivityIndicator
							size='small'
							color='#0284C7'
							style={{ marginLeft: 8 }}
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
						Please select a valid city or country from suggestions
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
									<Text style={styles.suggestionType}>
										{place.type === "country"
											? "🌍 Country"
											: "🏙️ City"}
									</Text>
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
				<Text style={styles.label}>Places (Cities or Countries)</Text>
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
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	label: { fontSize: 14, fontWeight: "700", color: "#1f2937" },
	addBtn: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 12,
		backgroundColor: "#e0f2fe",
	},
	addText: { color: "#0284C7", fontSize: 16, fontWeight: "700" },
	row: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F8FAFC",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	rowError: {
		borderColor: "#DC2626",
		backgroundColor: "#FEF2F2",
	},
	rowValid: {
		borderColor: "#10B981",
		backgroundColor: "#F0FDF4",
	},
	input: { flex: 1, fontSize: 15, color: "#0F172A", paddingVertical: 6 },
	removeBtn: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#fee2e2",
		alignItems: "center",
		justifyContent: "center",
		marginLeft: 8,
	},
	removeText: { color: "#b91c1c", fontSize: 18, fontWeight: "700" },
	checkmark: {
		color: "#10B981",
		fontSize: 18,
		fontWeight: "700",
		marginLeft: 8,
	},
	errorText: {
		color: "#DC2626",
		fontSize: 12,
		marginTop: 4,
		marginLeft: 4,
	},
	suggestionsContainer: {
		backgroundColor: "#fff",
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		marginTop: 4,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	suggestionItem: {
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#F1F5F9",
	},
	suggestionContent: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	suggestionText: {
		fontSize: 14,
		color: "#0F172A",
		flex: 1,
	},
	suggestionType: {
		fontSize: 11,
		color: "#64748B",
		marginLeft: 8,
	},
});
