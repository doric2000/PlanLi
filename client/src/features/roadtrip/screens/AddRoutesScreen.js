import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { useBackButton } from "../../../hooks/useBackButton";
import { useUnsavedLeaveGuard } from "../../../hooks/useUnsavedLeaveGuard";
import { getUserTier } from "../../../utils/userTier";
import ChipSelector from "../../community/components/ChipSelector";
import { derivePlacesFromStops, flattenValidRouteStops } from "../utils/routeStops";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";

function buildRouteComparableFromSource(r) {
	if (!r) return null;
	return JSON.stringify({
		title: (r.Title || "").trim(),
		days: r.days != null && r.days !== "" ? String(r.days) : "",
		distance: r.distance != null && r.distance !== "" ? String(r.distance) : "",
		desc: (r.desc || "").trim(),
		tripDaysData: r.tripDaysData || [],
		difficultyTag: r.difficultyTag || "",
		travelStyleTag: r.travelStyleTag || "",
		roadTripTags: [...(r.roadTripTags || [])].sort(),
		experienceTags: [...(r.experienceTags || [])].sort(),
	});
}

function buildRouteFormComparable({
	title,
	days,
	distance,
	desc,
	tripDays,
	difficultyTag,
	travelStyleTag,
	roadTripTags,
	experienceTags,
}) {
	return JSON.stringify({
		title: (title || "").trim(),
		days: days != null && days !== "" ? String(days) : "",
		distance: distance != null && distance !== "" ? String(distance) : "",
		desc: (desc || "").trim(),
		tripDaysData: tripDays || [],
		difficultyTag: difficultyTag || "",
		travelStyleTag: travelStyleTag || "",
		roadTripTags: [...(roadTripTags || [])].sort(),
		experienceTags: [...(experienceTags || [])].sort(),
	});
}

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
	const editingRouteId = routeToEdit?.id ?? null;

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
	const [editRouteBaseline, setEditRouteBaseline] = useState(null);
	const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);

	const { user } = useCurrentUser();
	const getLabel = (item) => (typeof item === "object" ? item.label : item);

	useEffect(() => {
		if (!routeToEdit) {
			setEditRouteBaseline(null);
			return;
		}

		setTitle(routeToEdit.Title || "");
		setDays(routeToEdit.days ? String(routeToEdit.days) : "");
		setDistance(routeToEdit.distance ? String(routeToEdit.distance) : "");
		setDesc(routeToEdit.desc || "");
		setTripDays(routeToEdit.tripDaysData || []);
		setDifficultyTag(routeToEdit.difficultyTag || "");
		setTravelStyleTag(routeToEdit.travelStyleTag || "");
		setRoadTripTags(routeToEdit.roadTripTags || []);
		setExperienceTags(routeToEdit.experienceTags || []);
		setEditRouteBaseline(buildRouteComparableFromSource(routeToEdit));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate when route id stable; read latest routeToEdit when id changes
	}, [editingRouteId]);

	const routeFormComparable = useMemo(
		() =>
			buildRouteFormComparable({
				title,
				days,
				distance,
				desc,
				tripDays,
				difficultyTag,
				travelStyleTag,
				roadTripTags,
				experienceTags,
			}),
		[
			title,
			days,
			distance,
			desc,
			tripDays,
			difficultyTag,
			travelStyleTag,
			roadTripTags,
			experienceTags,
		]
	);

	const hasUnsavedChanges = Boolean(
		routeToEdit && editRouteBaseline != null && editRouteBaseline !== routeFormComparable
	);

	const pendingDiscardRef = useRef(null);
	const dismissUnsavedModal = useCallback(() => {
		setUnsavedModalVisible(false);
		pendingDiscardRef.current = null;
	}, []);

	const confirmUnsavedLeave = useCallback(() => {
		const onConfirm = pendingDiscardRef.current;
		setUnsavedModalVisible(false);
		pendingDiscardRef.current = null;
		if (onConfirm) onConfirm();
	}, []);

	const promptDiscardUnsaved = useCallback((onConfirmLeave) => {
		pendingDiscardRef.current = onConfirmLeave;
		setUnsavedModalVisible(true);
	}, []);

	const { allowLeaveRef, handleHeaderBackPress } = useUnsavedLeaveGuard({
		navigation,
		guardActive: Boolean(routeToEdit),
		sessionKey: String(editingRouteId ?? ""),
		hasUnsavedChanges,
		submitting,
		openUnsavedPrompt: promptDiscardUnsaved,
	});

	useBackButton(navigation, {
		title: routeToEdit ? "עריכת מסלול" : "מסלול חדש",
		onPress: handleHeaderBackPress,
	});

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
			allowLeaveRef.current = true;
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
			<UnsavedChangesModal
				visible={unsavedModalVisible}
				title={UNSAVED_LEAVE_TITLE}
				message={UNSAVED_LEAVE_MESSAGE}
				onCancel={dismissUnsavedModal}
				onConfirm={confirmUnsavedLeave}
				testID="route-unsaved-discard-modal"
				cancelTestID="route-unsaved-discard-cancel"
				confirmTestID="route-unsaved-discard-confirm"
			/>
		</View>
	);
}
