import { useState, useEffect } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TextInput,
	TouchableOpacity,
	Alert,
} from "react-native";
import { styles, buttonStyles } from "./RoutesScreen.js";
import { db, auth } from "../config/firebase.js";
import {
	collection,
	addDoc,
	getDoc,
	doc,
	serverTimestamp,
} from "firebase/firestore";
import { ActivityIndicator } from "react-native";
import {
	DIFFICULTY_TAGS,
	TRAVEL_STYLE_TAGS,
	ROAD_TRIP_TAGS,
	EXPERIENCE_TAGS,
} from "../constants/Constatns.js";
import PlacesInput from "../components/PlacesInput.js";
import { useBackButton } from "../hooks/useBackButton";
import { useCurrentUser } from "../hooks/useCurrentUser";
import DayEditorModal from "../components/DayEditorModal";
import DayList from "../components/DayList";

const PlaceholderColor = "#9CA3AF";

const FormInput = ({
	label,
	value,
	onChangeText,
	placeholder,
	keyboardType = "default",
	multiline = false,
	style,
}) => (
	<View style={formStyles.inputWrapper}>
		<TextInput
			style={[
				formStyles.input,
				multiline && formStyles.inputMultiline,
				style,
			]}
			placeholder={placeholder}
			placeholderTextColor={PlaceholderColor}
			value={value}
			onChangeText={onChangeText}
			keyboardType={keyboardType}
			multiline={multiline}
		/>
	</View>
);

export default function AddRoutesScreen({ navigation }) {
	const [tripDays, setTripDays] = useState([]);
	const [isDayModalVisible, setDayModalVisible] = useState(false);
	const [editingDayIndex, setEditingDayIndex] = useState(null);
	const [difficultyTag, setDifficultyTag] = useState("");
	const [travelStyleTag, setTravelStyleTag] = useState("");
	const [roadTripTags, setRoadTripTags] = useState([]);
	const [experienceTags, setExperienceTags] = useState([]);
	const [title, setTitle] = useState("");
	const [days, setDays] = useState("");
	const [places, setPlaces] = useState([""]);
	const [distance, setDistance] = useState("");
	const [tags, setTags] = useState([]);
	const [desc, setDesc] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const { user, loading: userLoading } = useCurrentUser();

	const newRoute = {
		Title: title,
		user,
		days,
		tripDaysData: tripDays,
		places,
		distance,
		tags,
		desc,
		difficultyTag,
		travelStyleTag,
		roadTripTags,
		experienceTags,
	};
	// Handlers for Day Logic
	const handleAddDay = () => {
		setEditingDayIndex(tripDays.length); // New index
		setDayModalVisible(true);
	};

	const handleEditDay = (index) => {
		setEditingDayIndex(index);
		setDayModalVisible(true);
	};
	const handleSaveDay = (dayData, index) => {
		const newTripDays = [...tripDays];
		if (index >= newTripDays.length) {
			// Adding new
			newTripDays.push(dayData);
		} else {
			// Updating existing
			newTripDays[index] = dayData;
		}
		setTripDays(newTripDays);

		// Optional: Update the "Days" numeric input automatically
		setDays(newTripDays.length.toString());
	};
	const toggleSingle = (tag, setter) => setter(tag);
	const toggleMulti = (tag, list, setter) =>
		setter(
			list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]
		);

	const toggleTag = (tag) => {
		if (tags.includes(tag)) {
			setTags(tags.filter((t) => t !== tag));
		} else {
			setTags([...tags, tag]);
		}
	};

	const clearForm = () => {
		// Clear form
		setTitle("");
		setDays("");
		setPlaces([""]);
		setDistance("");
		setTags([]);
		setDesc("");
	};

	useBackButton(navigation);

	const addRoute = async () => {
		if (!user) {
			Alert.alert("Error", "User must be authenticated to post!");
			return;
		} else if (!title || !days || !places || !distance || !desc) {
			Alert.alert("Error", "Please fill in all fields.");
			return;
		}
		if (parseInt(days) < tripDays.length) {
			Alert.alert(
				"Days error",
				"You have added more day details than the total days specified!"
			);
			return;
		}
		setSubmitting(true);

		try {
			await addDoc(collection(db, "routes"), {
				userId: auth.currentUser?.uid,
				...newRoute,
				createdAt: serverTimestamp(),
			});
			Alert.alert("Success", "Route added succesfully!");
			clearForm();
			navigation.goBack();
		} catch (e) {
			Alert.alert("Error", "Failed to save route.");
		} finally {
			setSubmitting(false);
		}
	};
	const handleDeleteDay = (index) => {
		Alert.alert(
			"Delete Day",
			`Are you sure you want to remove Day ${index + 1}?`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						// Create a copy and remove the item at index
						const newTripDays = tripDays.filter(
							(_, i) => i !== index
						);
						setTripDays(newTripDays);

						// Update the days count input
						setDays(newTripDays.length.toString());

						// If we were editing this day, close the modal
						if (editingDayIndex === index) {
							setDayModalVisible(false);
							setEditingDayIndex(null);
						}
					},
				},
			]
		);
	};

	return (
		<ScrollView
			style={{ flex: 1 }}
			// nestedScrollEnabled
			keyboardShouldPersistTaps='handled'
			contentContainerStyle={{ paddingBottom: 120 }}
		>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Road Trips & Routes</Text>
				<Text style={styles.headerSubTitle}>
					Explore travel routes shared by the community
				</Text>
			</View>

			{/* Add Route Form */}
			<View style={{ padding: 20 }}>
				<Text
					style={{
						fontWeight: "bold",
						fontSize: 18,
						marginBottom: 10,
					}}
				>
					Add New Route
				</Text>
				<FormInput
					value={title}
					onChangeText={setTitle}
					placeholder='Title'
				/>
				<FormInput
					value={days}
					onChangeText={setDays}
					placeholder='Days'
					keyboardType='numeric'
				/>
				<DayList
					days={tripDays}
					onAdd={handleAddDay}
					onEdit={handleEditDay}
					onDelete={handleDeleteDay}
				/>
				<PlacesInput places={places} setPlaces={setPlaces} />
				<FormInput
					value={distance}
					onChangeText={setDistance}
					placeholder='Distance (km)'
					keyboardType='numeric'
				/>
				<FormInput
					value={desc}
					onChangeText={setDesc}
					placeholder='Description'
					multiline
					style={{ minHeight: 120 }}
				/>
				<Text style={chipStyles.sectionLabel}>Difficulty (single)</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ marginBottom: 12 }}
				>
					{DIFFICULTY_TAGS.map((tag) => (
						<TouchableOpacity
							key={tag}
							style={[
								chipStyles.chip,
								difficultyTag === tag &&
									chipStyles.chipSelected,
							]}
							onPress={() => toggleSingle(tag, setDifficultyTag)}
						>
							<Text
								style={[
									chipStyles.chipText,
									difficultyTag === tag &&
										chipStyles.chipTextSelected,
								]}
							>
								{tag}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>

				<Text style={chipStyles.sectionLabel}>
					Travel Style (single)
				</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ marginBottom: 12 }}
				>
					{TRAVEL_STYLE_TAGS.map((tag) => (
						<TouchableOpacity
							key={tag}
							style={[
								chipStyles.chip,
								travelStyleTag === tag &&
									chipStyles.chipSelected,
							]}
							onPress={() => toggleSingle(tag, setTravelStyleTag)}
						>
							<Text
								style={[
									chipStyles.chipText,
									travelStyleTag === tag &&
										chipStyles.chipTextSelected,
								]}
							>
								{tag}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>

				<Text style={chipStyles.sectionLabel}>
					Road Trip Tags (multi)
				</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ marginBottom: 12 }}
				>
					{ROAD_TRIP_TAGS.map((tag) => (
						<TouchableOpacity
							key={tag}
							style={[
								chipStyles.chip,
								roadTripTags.includes(tag) &&
									chipStyles.chipSelected,
							]}
							onPress={() =>
								toggleMulti(tag, roadTripTags, setRoadTripTags)
							}
						>
							<Text
								style={[
									chipStyles.chipText,
									roadTripTags.includes(tag) &&
										chipStyles.chipTextSelected,
								]}
							>
								{tag}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>

				<Text style={chipStyles.sectionLabel}>
					Experience Tags (multi)
				</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ marginBottom: 12 }}
				>
					{EXPERIENCE_TAGS.map((tag) => (
						<TouchableOpacity
							key={tag}
							style={[
								chipStyles.chip,
								experienceTags.includes(tag) &&
									chipStyles.chipSelected,
							]}
							onPress={() =>
								toggleMulti(
									tag,
									experienceTags,
									setExperienceTags
								)
							}
						>
							<Text
								style={[
									chipStyles.chipText,
									experienceTags.includes(tag) &&
										chipStyles.chipTextSelected,
								]}
							>
								{tag}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>
				<TouchableOpacity
					style={buttonStyles.submitButton}
					onPress={addRoute}
					disabled={submitting}
				>
					{submitting ? (
						<ActivityIndicator color='#fff' />
					) : (
						<Text style={buttonStyles.submitButtonText}>
							Add Route
						</Text>
					)}
				</TouchableOpacity>
			</View>
			<DayEditorModal
				visible={isDayModalVisible}
				onClose={() => setDayModalVisible(false)}
				onSave={handleSaveDay}
				dayIndex={editingDayIndex !== null ? editingDayIndex : 0}
				initialData={
					editingDayIndex !== null ? tripDays[editingDayIndex] : {}
				}
			/>
		</ScrollView>
	);
}

const formStyles = StyleSheet.create({
	inputWrapper: {
		marginBottom: 14,
	},
	label: {
		fontSize: 14,
		color: "#334155",
		marginBottom: 6,
		fontWeight: "600",
	},
	input: {
		backgroundColor: "#F8FAFC",
		paddingHorizontal: 14,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		fontSize: 15,
		color: "#000000ff",
	},
	inputMultiline: {
		backgroundColor: "#F8FAFC",
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		fontSize: 15,
		color: "#0F172A",
		minHeight: 110,
		textAlignVertical: "top",
	},
});

const chipStyles = StyleSheet.create({
	sectionLabel: {
		fontSize: 14,
		fontWeight: "700",
		color: "#1f2937",
		marginBottom: 8,
	},
	chip: {
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#e5e7eb",
		backgroundColor: "#fff",
		marginRight: 8,
	},
	chipSelected: {
		backgroundColor: "#E0F2FE",
		borderColor: "#0284C7",
	},
	chipText: {
		color: "#111827",
		fontSize: 14,
		fontWeight: "500",
	},
	chipTextSelected: {
		color: "#0284C7",
		fontWeight: "700",
	},
});
