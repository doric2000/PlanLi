import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
	colors,
	common,
	buttons,
	addRoutesScreenStyles as styles,
} from "../../../styles";
import {
	collection,
	addDoc,
	updateDoc,
	doc,
	serverTimestamp,
} from "firebase/firestore";
import {
	DIFFICULTY_TAGS,
	TRAVEL_STYLE_TAGS,
	ROAD_TRIP_TAGS,
	EXPERIENCE_TAGS,
} from "../../../constants/Constants.js";
import { db, auth } from "../../../config/firebase";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import DayEditorModal from "../components/DayEditorModal";
import DayList from "../components/DayList";
import { FormInput } from "../../../components/FormInput";
import { useBackButton } from "../../../hooks/useBackButton";
import { getUserTier } from "../../../utils/userTier";
import ChipSelector from "../../community/components/ChipSelector";
import { derivePlacesFromStops, flattenValidRouteStops } from "../utils/routeStops";

const createEmptyDay = () => ({
	description: "",
	image: null,
	stops: [],
});

const LabeledInput = ({ label, style, ...props }) => (
	<View style={[styles.fieldWrap, style]}>
		<Text style={styles.fieldLabel}>{label}</Text>
		<FormInput textAlign="right" {...props} />
	</View>
);

export default function AddRoutesScreen({ navigation, route }) {
	const routeToEdit = route?.params?.routeToEdit;
	useBackButton(navigation, { title: routeToEdit ? "עריכת מסלול" : "מסלול חדש" });

	const [title, setTitle] = useState("");
	const [days, setDays] = useState("");
	const [distance, setDistance] = useState("");
	const [desc, setDesc] = useState("");
	const [tripDays, setTripDays] = useState([]);
	const [difficultyTag, setDifficultyTag] = useState("");
	const [travelStyleTag, setTravelStyleTag] = useState("");
	const [roadTripTags, setRoadTripTags] = useState([]);
	const [experienceTags, setExperienceTags] = useState([]);
	const [tags, setTags] = useState([]);
	const [submitting, setSubmitting] = useState(false);
	const [isDayModalVisible, setDayModalVisible] = useState(false);
	const [editingDayIndex, setEditingDayIndex] = useState(null);

	const { user } = useCurrentUser();
	const getLabel = (item) => (typeof item === "object" ? item.label : item);

	useEffect(() => {
		if (!routeToEdit) return;

		setTitle(routeToEdit.Title || "");
		setDays(routeToEdit.days ? String(routeToEdit.days) : "");
		setDistance(routeToEdit.distance ? String(routeToEdit.distance) : "");
		setDesc(routeToEdit.desc || "");
		setTripDays(routeToEdit.tripDaysData || []);
		setDifficultyTag(routeToEdit.difficultyTag || "");
		setTravelStyleTag(routeToEdit.travelStyleTag || "");
		setRoadTripTags(routeToEdit.roadTripTags || []);
		setExperienceTags(routeToEdit.experienceTags || []);
	}, [routeToEdit]);

	useEffect(() => {
		const parsedDays = Number.parseInt(days, 10);
		if (!Number.isFinite(parsedDays) || parsedDays < 1) {
			return;
		}

		setTripDays((currentDays) => {
			if (currentDays.length === parsedDays) return currentDays;
			if (currentDays.length > parsedDays) return currentDays.slice(0, parsedDays);

			return [
				...currentDays,
				...Array.from({ length: parsedDays - currentDays.length }, createEmptyDay),
			];
		});
	}, [days]);

	useEffect(() => {
		setTags([
			difficultyTag,
			travelStyleTag,
			...roadTripTags,
			...experienceTags,
		].filter(Boolean));
	}, [difficultyTag, travelStyleTag, roadTripTags, experienceTags]);

	const ensureVerifiedForWrite = () => {
		const tier = getUserTier(auth.currentUser);
		if (tier === "guest") {
			Alert.alert("יש להתחבר", "כדי ליצור או לערוך מסלול צריך להתחבר.");
			navigation.navigate("Login");
			return false;
		}
		if (tier === "unverified") {
			Alert.alert("נדרש אימות", "כדי ליצור או לערוך מסלול צריך לאמת את האימייל.");
			navigation.navigate("VerifyEmail");
			return false;
		}
		return true;
	};

	const handleSaveDay = (dayData, index) => {
		setTripDays((currentDays) => {
			const nextDays = [...currentDays];
			nextDays[index] = dayData;
			return nextDays;
		});
	};

	const openDayEditor = (index) => {
		setEditingDayIndex(index);
		setDayModalVisible(true);
	};

	const addRoute = async () => {
		if (!ensureVerifiedForWrite()) return;
		if (!user) {
			Alert.alert("שגיאה", "משתמש חייב להיות מחובר.");
			return;
		}

		const parsedDays = Number.parseInt(days, 10);
		const parsedDistance = Number.parseFloat(distance);
		const derivedPlaces = derivePlacesFromStops(tripDays);
		const validStops = flattenValidRouteStops(tripDays);

		if (!title.trim() || !Number.isFinite(parsedDays) || parsedDays < 1 || !Number.isFinite(parsedDistance) || !desc.trim() || validStops.length === 0) {
			Alert.alert("שגיאה", "מלא כותרת, מספר ימים, מרחק, תיאור ולפחות תחנה אחת עם מיקום מדויק.");
			return;
		}

		setSubmitting(true);

		const routeData = {
			Title: title.trim(),
			days: parsedDays,
			tripDaysData: tripDays,
			places: derivedPlaces,
			distance: parsedDistance,
			tags,
			desc: desc.trim(),
			difficultyTag,
			travelStyleTag,
			roadTripTags,
			experienceTags,
			userId: user.uid,
		};

		try {
			if (routeToEdit) {
				await updateDoc(doc(db, "routes", routeToEdit.id), {
					...routeData,
					updatedAt: serverTimestamp(),
				});
				Alert.alert("הצלחה", "המסלול עודכן.");
			} else {
				await addDoc(collection(db, "routes"), {
					...routeData,
					createdAt: serverTimestamp(),
				});
				Alert.alert("הצלחה", "המסלול נוסף.");
			}
			navigation.goBack();
		} catch (error) {
			console.error("Firestore Error:", error);
			Alert.alert("שגיאה", "לא הצלחנו לשמור את המסלול.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<View style={[common.container, styles.container]}>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={styles.scrollContent}
			>
				<Text style={styles.screenTitle}>
					{routeToEdit ? "עריכת מסלול" : "מסלול חדש"}
				</Text>

				<LabeledInput
					label="כותרת המסלול"
					placeholder="לדוגמה: מסלול טבע בנורבגיה"
					value={title}
					onChangeText={setTitle}
					testID="route-title-input"
				/>

				<LabeledInput
					label="מספר ימים"
					placeholder="כמה ימים כוללת התוכנית?"
					value={days}
					onChangeText={setDays}
					keyboardType="numeric"
					testID="route-days-input"
				/>

				<DayList
					days={tripDays}
					onEdit={openDayEditor}
				/>

				<LabeledInput
					label="מרחק (ק״מ)"
					placeholder="לדוגמה: 120"
					value={distance}
					onChangeText={setDistance}
					keyboardType="numeric"
					testID="route-distance-input"
				/>

				<LabeledInput
					label="תיאור המסלול"
					placeholder="תאר בקצרה את המסלול והאווירה"
					value={desc}
					onChangeText={setDesc}
					multiline
					numberOfLines={4}
					testID="route-description-input"
					style={styles.descriptionField}
				/>

				<ChipSelector
					label="רמת קושי"
					items={DIFFICULTY_TAGS.map(getLabel)}
					selectedValue={difficultyTag}
					onSelect={setDifficultyTag}
					multiSelect={false}
					testIDPrefix="route-difficulty"
				/>

				<ChipSelector
					label="סגנון טיול"
					items={TRAVEL_STYLE_TAGS.map(getLabel)}
					selectedValue={travelStyleTag}
					onSelect={setTravelStyleTag}
					multiSelect={false}
					testIDPrefix="route-style"
				/>

				<ChipSelector
					label="תגיות רודטריפ"
					items={ROAD_TRIP_TAGS.map(getLabel)}
					selectedValue={roadTripTags}
					onSelect={(tag) => {
						setRoadTripTags((previousTags) =>
							previousTags.includes(tag)
								? previousTags.filter((item) => item !== tag)
								: [...previousTags, tag]
						);
					}}
					multiSelect
					testIDPrefix="route-roadtrip"
				/>

				<ChipSelector
					label="חוויה"
					items={EXPERIENCE_TAGS.map(getLabel)}
					selectedValue={experienceTags}
					onSelect={(tag) => {
						setExperienceTags((previousTags) =>
							previousTags.includes(tag)
								? previousTags.filter((item) => item !== tag)
								: [...previousTags, tag]
						);
					}}
					multiSelect
					testIDPrefix="route-experience"
				/>

				<TouchableOpacity
					style={[buttons.submit, submitting && buttons.disabled]}
					onPress={addRoute}
					disabled={submitting}
					testID="route-submit"
				>
					{submitting ? (
						<ActivityIndicator color={colors.white} />
					) : (
						<Text style={buttons.submitText}>
							{routeToEdit ? "שמור שינויים" : "פרסם מסלול"}
						</Text>
					)}
				</TouchableOpacity>
			</ScrollView>

			<DayEditorModal
				visible={isDayModalVisible}
				onClose={() => setDayModalVisible(false)}
				onSave={handleSaveDay}
				dayIndex={editingDayIndex !== null ? editingDayIndex : 0}
				initialData={editingDayIndex !== null ? tripDays[editingDayIndex] : {}}
			/>
		</View>
	);
}
