import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
	colors,
	common,
	buttons,
	addRoutesScreenStyles as styles,
} from "../../../styles";
import {
	CATEGORIES,
	ENVIRONMENTS,
	NEEDS,
	PACES,
	POST_BUDGETS,
	ROUTE_DIFFICULTIES,
	ROUTE_EXPERIENCE_LEVELS,
	SEASONS,
	TAG_OPTIONS_BY_CATEGORY,
	TRANSPORT_MODES,
	TRAVELER_STYLES,
	TRAVEL_PARTIES,
	TRAVEL_TAXONOMY_VERSION,
	VIBES,
} from "../../../constants/travelTaxonomy";
import { auth } from "../../../config/firebase";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useImagePickerWithUpload } from "../../../hooks/useImagePickerWithUpload";
import DayEditorModal from "../components/DayEditorModal";
import DayList from "../components/DayList";
import { FormInput } from "../../../components/FormInput";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { useBackButton } from "../../../hooks/useBackButton";
import { useUnsavedLeaveGuard } from "../../../hooks/useUnsavedLeaveGuard";
import { getUserTier } from "../../../utils/userTier";
import ChipSelector from "../../community/components/ChipSelector";
import {
	prepareRouteMedia,
	revokeRouteObjectUrls,
} from "../utils/routeMedia";
import { derivePlacesFromStops, flattenValidRouteStops } from "../utils/routeStops";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import { saveRoute } from "../../../services/RouteService";

const canonicalAttributes = (attributes = {}) => ({
	audienceScope: attributes.audienceScope || "selected",
	audiences: [...(attributes.audiences || [])].sort(),
	vibes: [...(attributes.vibes || [])].sort(),
	travelerStyles: [...(attributes.travelerStyles || [])].sort(),
	needs: [...(attributes.needs || [])].sort(),
	needsCoverageConfirmed: Boolean(attributes.needsCoverageConfirmed),
	budgetLevel: attributes.budgetLevel || "",
	seasons: [...(attributes.seasons || [])].sort(),
	environment: attributes.environment || "",
});

function buildRouteComparableFromSource(r) {
	if (!r) return null;
	return JSON.stringify({
		title: (r.title || "").trim(),
		days: r.dayCount != null && r.dayCount !== "" ? String(r.dayCount) : "",
		distance: r.distanceKm != null && r.distanceKm !== "" ? String(r.distanceKm) : "",
		desc: (r.description || "").trim(),
		routeDays: r.days || [],
		categoryIds: [...(r.categoryIds || [])].sort(),
		subcategoryIds: [...(r.subcategoryIds || [])].sort(),
		attributes: canonicalAttributes({
			audienceScope: r.facets?.audienceScope || (r.facets?.audiences?.length ? "selected" : "all"),
			audiences: r.facets?.audiences,
			vibes: r.facets?.vibes,
			travelerStyles: r.facets?.travelerStyles,
			needs: r.facets?.needs,
			needsCoverageConfirmed: r.facets?.needsScope === "entire_route" || Boolean(r.facets?.needs?.length),
			budgetLevel: r.facets?.budgetLevel,
			seasons: r.facets?.seasons,
			environment: r.facets?.environments?.[0] || "",
		}),
		difficulty: r.difficulty || "",
		experienceLevel: r.experienceLevel || "",
		transportModes: [...(r.transportModes || [])].sort(),
		pace: r.pace || "",
	});
}

function buildRouteFormComparable({
	title,
	days,
	distance,
	desc,
	tripDays,
	categoryIds,
	subcategoryIds,
	attributes,
	difficulty,
	experienceLevel,
	transportModes,
	pace,
}) {
	return JSON.stringify({
		title: (title || "").trim(),
		days: days != null && days !== "" ? String(days) : "",
		distance: distance != null && distance !== "" ? String(distance) : "",
		desc: (desc || "").trim(),
		routeDays: tripDays || [],
		categoryIds: [...(categoryIds || [])].sort(),
		subcategoryIds: [...(subcategoryIds || [])].sort(),
		attributes: canonicalAttributes(attributes),
		difficulty: difficulty || "",
		experienceLevel: experienceLevel || "",
		transportModes: [...(transportModes || [])].sort(),
		pace: pace || "",
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
	const [categoryIds, setCategoryIds] = useState([]);
	const [subcategoryIds, setSubcategoryIds] = useState([]);
	const [audienceScope, setAudienceScope] = useState("selected");
	const [audiences, setAudiences] = useState([]);
	const [budgetLevel, setBudgetLevel] = useState("");
	const [difficulty, setDifficulty] = useState("");
	const [experienceLevel, setExperienceLevel] = useState("");
	const [transportModes, setTransportModes] = useState([]);
	const [pace, setPace] = useState("");
	const [vibes, setVibes] = useState([]);
	const [travelerStyles, setTravelerStyles] = useState([]);
	const [needs, setNeeds] = useState([]);
	const [needsCoverageConfirmed, setNeedsCoverageConfirmed] = useState(false);
	const [seasons, setSeasons] = useState([]);
	const [environment, setEnvironment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [isDayModalVisible, setDayModalVisible] = useState(false);
	const [editingDayIndex, setEditingDayIndex] = useState(null);
	const [editRouteBaseline, setEditRouteBaseline] = useState(null);
	const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);

	const { user } = useCurrentUser();
	const { uploadImageAssets } = useImagePickerWithUpload({
		kind: "route",
		quality: 1,
		maxLongEdge: 2560,
		normalizeCompress: 0.94,
	});
	const toggle = (setter, value, maximum = 20) => setter((current) => current.includes(value)
		? current.filter((item) => item !== value)
		: [...current, value].slice(0, maximum));

	useEffect(() => {
		if (!routeToEdit) {
			setEditRouteBaseline(null);
			return;
		}

		setTitle(routeToEdit.title || "");
		setDays(routeToEdit.dayCount ? String(routeToEdit.dayCount) : "");
		setDistance(routeToEdit.distanceKm ? String(routeToEdit.distanceKm) : "");
		setDesc(routeToEdit.description || "");
		setTripDays(routeToEdit.days || []);
		setCategoryIds(routeToEdit.categoryIds || []);
		setSubcategoryIds(routeToEdit.subcategoryIds || []);
		setAudienceScope(routeToEdit.facets?.audienceScope || (routeToEdit.facets?.audiences?.length ? "selected" : "all"));
		setAudiences(routeToEdit.facets?.audiences || []);
		setBudgetLevel(routeToEdit.facets?.budgetLevel || "");
		setDifficulty(routeToEdit.difficulty || "");
		setExperienceLevel(routeToEdit.experienceLevel || "");
		setTransportModes(routeToEdit.transportModes || []);
		setPace(routeToEdit.pace || "");
		setVibes(routeToEdit.facets?.vibes || []);
		setTravelerStyles(routeToEdit.facets?.travelerStyles || []);
		setNeeds(routeToEdit.facets?.needs || []);
		setNeedsCoverageConfirmed(routeToEdit.facets?.needsScope === "entire_route" || Boolean(routeToEdit.facets?.needs?.length));
		setSeasons(routeToEdit.facets?.seasons || []);
		setEnvironment(routeToEdit.facets?.environments?.[0] || "");
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
				categoryIds,
				subcategoryIds,
				attributes: { audienceScope, audiences, budgetLevel, vibes, travelerStyles, needs, needsCoverageConfirmed, seasons, environment },
				difficulty,
				experienceLevel,
				transportModes,
				pace,
			}),
		[
			title,
			days,
			distance,
			desc,
			tripDays,
			categoryIds,
			subcategoryIds,
			audienceScope,
			audiences,
			budgetLevel,
			difficulty,
			experienceLevel,
			transportModes,
			pace,
			vibes,
			travelerStyles,
			needs,
			needsCoverageConfirmed,
			seasons,
			environment,
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
		if (!needs.length) setNeedsCoverageConfirmed(false);
	}, [needs.length]);

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
		const hasSubcategoryForEveryCategory = categoryIds.length > 0 && categoryIds.every(
			(categoryId) => (TAG_OPTIONS_BY_CATEGORY[categoryId] || []).some(
				(tag) => subcategoryIds.includes(tag.id)
			)
		);
		const hasAudience = audienceScope === "all" || audiences.length > 0;

		if (!title.trim() || !Number.isFinite(parsedDays) || parsedDays < 1 || !Number.isFinite(parsedDistance) || !desc.trim() || validStops.length === 0 || !hasSubcategoryForEveryCategory || !hasAudience || !budgetLevel || !difficulty || transportModes.length === 0 || !pace || seasons.length === 0 || !environment || (needs.length > 0 && !needsCoverageConfirmed)) {
			Alert.alert("שגיאה", "מלאו כותרת, ימים, מרחק, תיאור, תחנה מדויקת, תת־קטגוריה לכל קטגוריה, קהל, תקציב, קושי, אמצעי התניידות, קצב, עונה וסביבה. אם סומנו צרכים, אשרו שהם נכונים לכל המסלול.");
			return;
		}

		setSubmitting(true);
		try {
			const preparedMedia = await prepareRouteMedia(
				tripDays,
				uploadImageAssets
			);
			const routeData = {
				taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
				title: title.trim(),
				description: desc.trim(),
				distanceKm: parsedDistance,
				days: preparedMedia.days,
				categoryIds,
				subcategoryIds,
				attributes: {
					audienceScope,
					audiences: audienceScope === "all" ? [] : audiences,
					budgetLevel,
					vibes,
					travelerStyles,
					needs,
					needsCoverageConfirmed,
					seasons,
					environment,
				},
				difficulty,
				experienceLevel,
				transportModes,
				pace,
			};

			await saveRoute(routeData, routeToEdit?.id || null);
			if (routeToEdit) {
				Alert.alert("הצלחה", "המסלול עודכן.");
			} else {
				Alert.alert("הצלחה", "המסלול נוסף.");
			}
			revokeRouteObjectUrls(tripDays);
			allowLeaveRef.current = true;
			navigation.goBack();
		} catch (error) {
			console.error("Firestore Error:", error);
			// Unclaimed prepared media is removed by the scheduled server cleanup.
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

				<ChipSelector label="קטגוריות במסלול" items={CATEGORIES.map((item) => item.label)}
					selectedValue={CATEGORIES.filter((item) => categoryIds.includes(item.id)).map((item) => item.label)}
					onSelect={(label) => {
						const id = CATEGORIES.find((item) => item.label === label)?.id;
						if (!id) return;
						if (categoryIds.includes(id)) setSubcategoryIds((current) => current.filter((tagId) => !(TAG_OPTIONS_BY_CATEGORY[id] || []).some((tag) => tag.id === tagId)));
						toggle(setCategoryIds, id, 8);
					}} multiSelect testIDPrefix="route-category" />
				{categoryIds.map((categoryId) => <ChipSelector key={categoryId}
					label={`תתי־קטגוריות · ${CATEGORIES.find((item) => item.id === categoryId)?.label || ''}`}
					items={(TAG_OPTIONS_BY_CATEGORY[categoryId] || []).map((item) => item.label)}
					selectedValue={(TAG_OPTIONS_BY_CATEGORY[categoryId] || []).filter((item) => subcategoryIds.includes(item.id)).map((item) => item.label)}
					onSelect={(label) => { const id = (TAG_OPTIONS_BY_CATEGORY[categoryId] || []).find((item) => item.label === label)?.id; if (id) toggle(setSubcategoryIds, id, 20); }}
					multiSelect testIDPrefix={`route-subcategory-${categoryId}`} />)}
				<ChipSelector label="היקף התאמה לקהל (חובה)" items={["מתאים לכולם", "בחירת קהלים"]}
					selectedValue={audienceScope === "all" ? "מתאים לכולם" : "בחירת קהלים"}
					onSelect={(label) => {
						const nextScope = label === "מתאים לכולם" ? "all" : "selected";
						setAudienceScope(nextScope);
						if (nextScope === "all") setAudiences([]);
					}} testIDPrefix="route-audience-scope" />
				{audienceScope === "selected" ? <ChipSelector label="מתאים למי (חובה)" items={TRAVEL_PARTIES.map((item) => item.label)}
					selectedValue={TRAVEL_PARTIES.filter((item) => audiences.includes(item.value)).map((item) => item.label)}
					onSelect={(label) => { const id = TRAVEL_PARTIES.find((item) => item.label === label)?.value; if (id) toggle(setAudiences, id, 6); }} multiSelect testIDPrefix="route-audience" /> : null}
				<ChipSelector label="רמת מחיר (חובה)" items={POST_BUDGETS.map((item) => item.postLabel)}
					selectedValue={POST_BUDGETS.find((item) => item.value === budgetLevel)?.postLabel || ''}
					onSelect={(label) => setBudgetLevel(POST_BUDGETS.find((item) => item.postLabel === label)?.value || '')} testIDPrefix="route-budget" />
				<ChipSelector label="רמת קושי (חובה)" items={ROUTE_DIFFICULTIES.map((item) => item.label)}
					selectedValue={ROUTE_DIFFICULTIES.find((item) => item.value === difficulty)?.label || ''}
					onSelect={(label) => setDifficulty(ROUTE_DIFFICULTIES.find((item) => item.label === label)?.value || '')} testIDPrefix="route-difficulty" />
				<ChipSelector label="אמצעי התניידות (חובה)" items={TRANSPORT_MODES.map((item) => item.label)}
					selectedValue={TRANSPORT_MODES.filter((item) => transportModes.includes(item.value)).map((item) => item.label)}
					onSelect={(label) => { const id = TRANSPORT_MODES.find((item) => item.label === label)?.value; if (id) toggle(setTransportModes, id, 4); }} multiSelect testIDPrefix="route-transport" />
				<ChipSelector label="ניסיון נדרש" items={ROUTE_EXPERIENCE_LEVELS.map((item) => item.label)}
					selectedValue={ROUTE_EXPERIENCE_LEVELS.find((item) => item.value === experienceLevel)?.label || ''}
					onSelect={(label) => setExperienceLevel(ROUTE_EXPERIENCE_LEVELS.find((item) => item.label === label)?.value || '')} testIDPrefix="route-experience" />
				<ChipSelector label="אווירה" items={VIBES.map((item) => item.label)} selectedValue={VIBES.filter((item) => vibes.includes(item.value)).map((item) => item.label)}
					onSelect={(label) => { const id = VIBES.find((item) => item.label === label)?.value; if (id) toggle(setVibes, id, 4); }} multiSelect testIDPrefix="route-vibe" />
				<ChipSelector label="סגנון טיול" items={TRAVELER_STYLES.map((item) => item.label)} selectedValue={TRAVELER_STYLES.filter((item) => travelerStyles.includes(item.value)).map((item) => item.label)}
					onSelect={(label) => { const id = TRAVELER_STYLES.find((item) => item.label === label)?.value; if (id) toggle(setTravelerStyles, id, 4); }} multiSelect testIDPrefix="route-style" />
				<ChipSelector label="קצב (חובה)" items={PACES.map((item) => item.label)} selectedValue={PACES.find((item) => item.value === pace)?.label || ''}
					onSelect={(label) => setPace(PACES.find((item) => item.label === label)?.value || '')} testIDPrefix="route-pace" />
				<ChipSelector label="עונה מתאימה (חובה)" items={SEASONS.map((item) => item.label)} selectedValue={SEASONS.filter((item) => seasons.includes(item.value)).map((item) => item.label)}
					onSelect={(label) => { const id = SEASONS.find((item) => item.label === label)?.value; if (id) toggle(setSeasons, id, 6); }} multiSelect testIDPrefix="route-season" />
				<ChipSelector label="סביבה עיקרית (חובה)" items={ENVIRONMENTS.map((item) => item.label)} selectedValue={ENVIRONMENTS.find((item) => item.value === environment)?.label || ''}
					onSelect={(label) => setEnvironment(ENVIRONMENTS.find((item) => item.label === label)?.value || '')} testIDPrefix="route-environment" />
				<ChipSelector label="מידע מעשי ונגישות" items={NEEDS.map((item) => item.label)} selectedValue={NEEDS.filter((item) => needs.includes(item.value)).map((item) => item.label)}
					onSelect={(label) => { const id = NEEDS.find((item) => item.label === label)?.value; if (id) toggle(setNeeds, id, NEEDS.length); }} multiSelect testIDPrefix="route-need" />
				{needs.length > 0 ? (
					<TouchableOpacity
						style={styles.confirmationRow}
						onPress={() => setNeedsCoverageConfirmed((current) => !current)}
						accessibilityRole="checkbox"
						accessibilityState={{ checked: needsCoverageConfirmed }}
						testID="route-needs-coverage-confirmation"
					>
						<View style={[styles.confirmationBox, needsCoverageConfirmed && styles.confirmationBoxChecked]}>
							{needsCoverageConfirmed ? <Text style={styles.confirmationCheck}>✓</Text> : null}
						</View>
						<Text style={styles.confirmationText}>בדקתי שהמידע שסומן נכון לכל המסלול, ולא רק לחלק מהתחנות.</Text>
					</TouchableOpacity>
				) : null}

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
