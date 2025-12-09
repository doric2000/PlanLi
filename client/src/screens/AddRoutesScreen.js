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
import { collection, addDoc, getDoc, doc, serverTimestamp } from "firebase/firestore";
import { ActivityIndicator } from "react-native";
import {
	DIFFICULTY_TAGS,
	TRAVEL_STYLE_TAGS,
	ROAD_TRIP_TAGS,
	EXPERIENCE_TAGS,
} from "../constants/Constatns.js";
import PlacesInput from "../components/PlacesInput.js";

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
	console.log("AddRoutesScreen rendering");
	const [difficultyTag, setDifficultyTag] = useState("");
	const [travelStyleTag, setTravelStyleTag] = useState("");
	const [roadTripTags, setRoadTripTags] = useState([]);
	const [experienceTags, setExperienceTags] = useState([]);
	const [title, setTitle] = useState("");
	const [user, setUser] = useState("");
	const [days, setDays] = useState("");
	const [places, setPlaces] = useState([""]);
	const [distance, setDistance] = useState("");
	const [tags, setTags] = useState([]);
	const [desc, setDesc] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const newRoute = {
		Title: title,
		user,
		days,
		places,
		distance,
		tags,
		desc,
		difficultyTag,
		travelStyleTag,
		roadTripTags,
		experienceTags,
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
		setUser("");
		setDays("");
		setPlaces([""]);
		setDistance("");
		setTags([]);
		setDesc("");
	};
	// Fetch username when component mounts
	useEffect(() => {
		const fetchUsername = async () => {
			try {
				const currentUser = auth.currentUser;
				if (currentUser) {
					console.log("IM HERE 1")
					// Get user document from Firestore
					const userDoc = await getDoc(
						doc(db, "users", currentUser.uid)
					);
					if (userDoc.exists()) {
											console.log("IM HERE 2")
						const userData = userDoc.data();
						setUser(
								userData.displayName ||
								currentUser.email
						);
					} else {
						// Fallback to email if user document doesn't exist
						setUser(currentUser.email);
					}
				}
			} catch (error) {
				console.error("Error fetching username:", error);
				// Fallback to email
				if (auth.currentUser) {
					setUser(auth.currentUser.email);
				}
			}
		};

		fetchUsername();
	}, []);
	const addRoute = async () => {
		if(!user){
			Alert.alert("Error","User must be authenticated to post!");
			return;
		}
		else if (!title || !days || !places || !distance || !desc) {
			Alert.alert("Error", "Please fill in all fields.");
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

	return (
		<ScrollView
			style={{ flex: 1 }}
			nestedScrollEnabled
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
				{/* <View style={tagStyle.tagsContainer}>
					{TAG_OPTIONS[].map((tag) => (
						<TouchableOpacity
							key={tag}
							style={[
								tagStyle.tagItem,
								tags.includes(tag) && tagStyle.tagItemSelected,
							]}
							onPress={() => toggleTag(tag)}
						>
							<Text
								style={[
									tagStyle.tagText,
									tags.includes(tag) &&
										tagStyle.tagTextSelected,
								]}
							>
								{tag}
							</Text>
						</TouchableOpacity>
					))}
				</View> */}
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
