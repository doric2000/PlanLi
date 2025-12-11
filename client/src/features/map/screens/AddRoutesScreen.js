import { useState, useEffect } from "react";
import {
	View,
	Text,
	ScrollView,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
} from "react-native";
import {
	colors,
	common,
	buttons,
	forms,
	tags as tagsStyle,
	typography,
} from "../../../styles";
import {
	collection,
	addDoc,
	getDoc,
	updateDoc,
	doc,
	serverTimestamp,
} from "firebase/firestore";
import {
	DIFFICULTY_TAGS,
	TRAVEL_STYLE_TAGS,
	ROAD_TRIP_TAGS,
	EXPERIENCE_TAGS,
} from "../../../constants/Constatns.js";
import { db, auth } from "../../../config/firebase.js";
import PlacesInput from "../components/PlacesInput.js";
import { useBackButton } from "../../../hooks/useBackButton.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import DayEditorModal from "../../trips/components/DayEditorModal.js";
import DayList from "../../trips/components/DayList.js";
import { FormInput } from "../../../components/FormInput.js";
import { TagSelector } from "../../../components/TagSelector.js";

/**
 * Screen for adding a new route.
 * Users can define days, places, distance, and tags for a route.
 *
 * @param {Object} navigation - Navigation object.
 * @param {Object} route - Route object containing params.
 */
export default function AddRoutesScreen({ navigation, route }) {
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
	const routeToEdit = route?.params?.routeToEdit;

	useEffect(() => {
		if (routeToEdit) {
			setTitle(routeToEdit.Title || "");
			setDays(routeToEdit.days ? routeToEdit.days.toString() : "");
			setPlaces(routeToEdit.places || [""]);
			setDistance(routeToEdit.distance ? routeToEdit.distance.toString() : "");
			setDesc(routeToEdit.desc || "");
			setTripDays(routeToEdit.tripDaysData || []);
			setDifficultyTag(routeToEdit.difficultyTag || "");
			setTravelStyleTag(routeToEdit.travelStyleTag || "");
			setRoadTripTags(routeToEdit.roadTripTags || []);
			setExperienceTags(routeToEdit.experienceTags || []);
		}
	}, [routeToEdit]);

	useEffect(() => {
		const combinedTags = [
			difficultyTag,
			travelStyleTag,
			...roadTripTags,
			...experienceTags,
		].filter(Boolean);
		setTags(combinedTags);
	}, [difficultyTag, travelStyleTag, roadTripTags, experienceTags]);

	const newRoute = {
		Title: title,
		user,
		days: parseInt(days, 10),
		tripDaysData: tripDays,
		places,
		distance: parseFloat(distance),
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
			if (routeToEdit) {
				await updateDoc(doc(db, "routes", routeToEdit.id), {
					...newRoute,
					updatedAt: serverTimestamp(),
				});
				Alert.alert("Success", "Route updated successfully!");
			} else {
				await addDoc(collection(db, "routes"), {
					userId: auth.currentUser?.uid,
					...newRoute,
					createdAt: serverTimestamp(),
				});
				Alert.alert("Success", "Route added succesfully!");
			}
			clearForm();
			navigation.goBack();
		} catch (e) {
			console.error(e);
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
			style={common.container}
			// nestedScrollEnabled
			keyboardShouldPersistTaps='handled'
			contentContainerStyle={{ paddingBottom: 120 }}
		>
			<View style={common.header}>
				<Text style={common.headerTitle}>Road Trips & Routes</Text>
				<Text style={common.headerSubTitle}>
					Explore travel routes shared by the community
				</Text>
			</View>

			{/* Add Route Form */}
			<View style={{ padding: 20 }}>
				<Text
					style={{
						...typography.h4,
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

				<TagSelector
					label='Difficulty (single)'
					tags={DIFFICULTY_TAGS}
					selected={difficultyTag}
					onSelect={setDifficultyTag}
				/>

				<TagSelector
					label='Travel Style (single)'
					tags={TRAVEL_STYLE_TAGS}
					selected={travelStyleTag}
					onSelect={setTravelStyleTag}
				/>

				<TagSelector
					label='Road Trip Tags (multi)'
					tags={ROAD_TRIP_TAGS}
					selected={roadTripTags}
					onSelect={setRoadTripTags}
					multi={true}
				/>

				<TagSelector
					label='Experience Tags (multi)'
					tags={EXPERIENCE_TAGS}
					selected={experienceTags}
					onSelect={setExperienceTags}
					multi={true}
				/>

				<TouchableOpacity
					style={buttons.submit}
					onPress={addRoute}
					disabled={submitting}
				>
					{submitting ? (
						<ActivityIndicator color={colors.white} />
					) : (
						<Text style={buttons.submitText}>
							{routeToEdit ? "Update Route" : "Add Route"}
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
