import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { randomUUID } from "expo-crypto";
import AppText from "../../../components/AppText";
import { common, spacing } from "../../../styles";
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
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useImagePickerWithUpload } from "../../../hooks/useImagePickerWithUpload";
import useDurableDraftMedia from "../../../hooks/useDurableDraftMedia";
import { useContentPublish } from "../../publishing/ContentPublishContext";
import DayEditorModal from "../components/DayEditorModal";
import DayList from "../components/DayList";
import { FormInput } from "../../../components/FormInput";
import { GuidedFormFooter, GuidedFormHeader, GuidedFormSection } from "../../../components/GuidedForm";
import RtlChoiceGroup from "../../../components/RtlChoiceGroup";
import { guidedFormStyles as guidedStyles } from "../../../components/guidedFormStyles";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { useBackButton } from "../../../hooks/useBackButton";
import { useUnsavedLeaveGuard } from "../../../hooks/useUnsavedLeaveGuard";
import { locationErrorKind, locationErrorMessage } from "../../../utils/locationErrors";
import {
	ensureRouteDraftIds,
	extractRoutePublishMedia,
	prepareRouteMedia,
	revokeRouteObjectUrls,
} from "../utils/routeMedia";
import { flattenValidRouteStops } from "../utils/routeStops";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import { saveRoute } from "../../../services/RouteService";
import {
	emptyValidation,
	firstInvalidSection,
	sectionErrorCount,
	validateRouteForm,
} from "../../../utils/guidedFormValidation";

const ROUTE_SECTION_ORDER = ["basics", "days", "category", "fit"];
const ROUTE_SECTION_FIELDS = {
	basics: ["title", "days", "distance", "desc"],
	days: ["stops"],
	category: ["categoryIds", "subcategoryIds"],
	fit: ["audiences", "budgetLevel", "difficulty", "transportModes", "pace", "seasons", "environment", "needsCoverageConfirmed"],
};

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
	draftId: randomUUID(),
	description: "",
	image: null,
	stops: [],
});

const EMPTY_ROUTE_COMPARABLE = buildRouteFormComparable({
	title: "",
	days: "",
	distance: "",
	desc: "",
	tripDays: [],
	categoryIds: [],
	subcategoryIds: [],
	attributes: {
		audienceScope: "selected",
		audiences: [],
		budgetLevel: "",
		vibes: [],
		travelerStyles: [],
		needs: [],
		needsCoverageConfirmed: false,
		seasons: [],
		environment: "",
	},
	difficulty: "",
	experienceLevel: "",
	transportModes: [],
	pace: "",
});

export default function AddRoutesScreen({ navigation, route }) {
	const routeToEdit = route?.params?.routeToEdit;
	const publishJobId = route?.params?.publishJobId || null;
	const editingRouteId = routeToEdit?.id ?? null;
	const { enqueueCreate, loadJobForReview } = useContentPublish();
	const {
		draftJobId,
		forgetUri: forgetDurableImage,
		markEnqueued: markDurableImagesEnqueued,
		mediaForUri: durableMediaForUri,
		persistUris: persistReviewedImages,
	} = useDurableDraftMedia({ enabled: !routeToEdit });

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
	const [expandedSection, setExpandedSection] = useState("basics");
	const [validation, setValidation] = useState(emptyValidation);
	const [optionalFitOpen, setOptionalFitOpen] = useState(false);
	const scrollRef = useRef(null);
	const sectionLayoutsRef = useRef({});

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
			setExpandedSection("basics");
			setValidation(emptyValidation());
			setOptionalFitOpen(false);
			return;
		}

		setTitle(routeToEdit.title || "");
		setDays(routeToEdit.dayCount ? String(routeToEdit.dayCount) : "");
		setDistance(routeToEdit.distanceKm ? String(routeToEdit.distanceKm) : "");
		setDesc(routeToEdit.description || "");
		setTripDays(ensureRouteDraftIds(routeToEdit.days || [], () => randomUUID()));
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
		setOptionalFitOpen(Boolean(
			routeToEdit.experienceLevel
			|| routeToEdit.facets?.vibes?.length
			|| routeToEdit.facets?.travelerStyles?.length
			|| routeToEdit.facets?.needs?.length
		));
		setExpandedSection("basics");
		setValidation(emptyValidation());
		setEditRouteBaseline(buildRouteComparableFromSource(routeToEdit));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate when route id stable; read latest routeToEdit when id changes
	}, [editingRouteId]);

	useEffect(() => {
		if (!publishJobId || routeToEdit) return undefined;
		let active = true;
		loadJobForReview(publishJobId).then((job) => {
			const restored = job?.reviewedDraft?.route;
			if (!active || !restored) return;
			const attributes = restored.attributes || {};
			setTitle(restored.title || "");
			setDays(restored.days?.length ? String(restored.days.length) : "");
			setDistance(restored.distanceKm != null ? String(restored.distanceKm) : "");
			setDesc(restored.description || "");
			setTripDays(ensureRouteDraftIds(restored.days || [], () => randomUUID()));
			setCategoryIds(restored.categoryIds || []);
			setSubcategoryIds(restored.subcategoryIds || []);
			setAudienceScope(attributes.audienceScope || "selected");
			setAudiences(attributes.audiences || []);
			setBudgetLevel(attributes.budgetLevel || "");
			setDifficulty(restored.difficulty || "");
			setExperienceLevel(restored.experienceLevel || "");
			setTransportModes(restored.transportModes || []);
			setPace(restored.pace || "");
			setVibes(attributes.vibes || []);
			setTravelerStyles(attributes.travelerStyles || []);
			setNeeds(attributes.needs || []);
			setNeedsCoverageConfirmed(Boolean(attributes.needsCoverageConfirmed));
			setSeasons(attributes.seasons || []);
			setEnvironment(attributes.environment || "");
			setExpandedSection("days");
			setValidation(emptyValidation());
		}).catch((error) => {
			console.error("Could not restore queued route:", error);
			if (active) Alert.alert("לא הצלחנו לפתוח את הטיול", "אפשר לנסות שוב מסרגל הפרסום.");
		});
		return () => { active = false; };
	}, [loadJobForReview, publishJobId, routeToEdit]);

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

	const hasUnsavedChanges = routeToEdit
		? Boolean(editRouteBaseline != null && editRouteBaseline !== routeFormComparable)
		: routeFormComparable !== EMPTY_ROUTE_COMPARABLE;

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
		guardActive: true,
		sessionKey: String(editingRouteId ?? "create"),
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
			if (currentDays.length > parsedDays) {
				currentDays.slice(parsedDays).forEach((day) => {
					Promise.resolve(forgetDurableImage(day?.image)).catch(() => {});
					(day?.stops || []).forEach((stop) => {
						Promise.resolve(forgetDurableImage(stop?.image)).catch(() => {});
					});
				});
				return currentDays.slice(0, parsedDays);
			}

			return [
				...currentDays,
				...Array.from({ length: parsedDays - currentDays.length }, createEmptyDay),
			];
		});
	// forgetDurableImage is stable for the lifetime of the draft.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [days]);

	useEffect(() => {
		if (!needs.length) setNeedsCoverageConfirmed(false);
	}, [needs.length]);

	const validStops = useMemo(() => flattenValidRouteStops(tripDays), [tripDays]);
	const validationValues = useMemo(() => ({
		title,
		days,
		distance,
		desc,
		validStops,
		categoryIds,
		subcategoryIds,
		tagOptionsByCategory: TAG_OPTIONS_BY_CATEGORY,
		audienceScope,
		audiences,
		budgetLevel,
		difficulty,
		transportModes,
		pace,
		seasons,
		environment,
		needs,
		needsCoverageConfirmed,
	}), [
		title,
		days,
		distance,
		desc,
		validStops,
		categoryIds,
		subcategoryIds,
		audienceScope,
		audiences,
		budgetLevel,
		difficulty,
		transportModes,
		pace,
		seasons,
		environment,
		needs,
		needsCoverageConfirmed,
	]);

	const scrollToSection = useCallback((sectionId) => {
		const y = sectionLayoutsRef.current[sectionId];
		if (typeof y === "number") {
			scrollRef.current?.scrollTo?.({ y: Math.max(0, y - spacing.sm), animated: true });
		}
	}, []);

	const replaceSectionValidation = useCallback((sectionId, nextValidation) => {
		setValidation((current) => {
			const fields = { ...(current?.fields || {}) };
			for (const field of ROUTE_SECTION_FIELDS[sectionId] || []) delete fields[field];
			Object.assign(fields, nextValidation.fields);
			const sections = { ...(current?.sections || {}) };
			delete sections[sectionId];
			if (nextValidation.sections[sectionId]?.length) sections[sectionId] = nextValidation.sections[sectionId];
			return { fields, sections };
		});
	}, []);

	const continueFromSection = useCallback((sectionId) => {
		const nextValidation = validateRouteForm(validationValues, sectionId);
		replaceSectionValidation(sectionId, nextValidation);
		if (sectionErrorCount(nextValidation, sectionId)) {
			setExpandedSection(sectionId);
			scrollToSection(sectionId);
			return false;
		}
		const currentIndex = ROUTE_SECTION_ORDER.indexOf(sectionId);
		const nextSection = ROUTE_SECTION_ORDER[currentIndex + 1];
		if (nextSection) {
			setExpandedSection(nextSection);
			if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => scrollToSection(nextSection));
			else scrollToSection(nextSection);
		}
		return true;
	}, [replaceSectionValidation, scrollToSection, validationValues]);

	const sectionIsComplete = useCallback((sectionId) => (
		sectionErrorCount(validateRouteForm(validationValues, sectionId), sectionId) === 0
	), [validationValues]);

	useEffect(() => {
		setValidation((current) => {
			const touchedSections = Object.keys(current?.sections || {});
			if (!touchedSections.length) return current;
			const next = emptyValidation();
			for (const sectionId of touchedSections) {
				const sectionValidation = validateRouteForm(validationValues, sectionId);
				Object.assign(next.fields, sectionValidation.fields);
				if (sectionValidation.sections[sectionId]?.length) {
					next.sections[sectionId] = sectionValidation.sections[sectionId];
				}
			}
			return next;
		});
	}, [validationValues]);

	const ensureVerifiedForWrite = () => {
		return true;
	};

	const handleSaveDay = (dayData, index) => {
		setTripDays((currentDays) => {
			const nextDays = [...currentDays];
			nextDays[index] = {
				...dayData,
				draftId: currentDays[index]?.draftId || dayData?.draftId || randomUUID(),
			};
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

		const parsedDistance = Number.parseFloat(distance);
		const nextValidation = validateRouteForm(validationValues);
		setValidation(nextValidation);
		const invalidSection = firstInvalidSection(nextValidation, ROUTE_SECTION_ORDER);
		if (invalidSection) {
			setExpandedSection(invalidSection);
			if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => scrollToSection(invalidSection));
			else scrollToSection(invalidSection);
			return;
		}

		setSubmitting(true);
		try {
			const routeData = {
				taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
				title: title.trim(),
				description: desc.trim(),
				distanceKm: parsedDistance,
				days: [],
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

			if (!routeToEdit) {
				const durableDays = ensureRouteDraftIds(tripDays, () => randomUUID());
				const queued = extractRoutePublishMedia(durableDays);
				const queuedRoute = { ...routeData, days: queued.days };
				await enqueueCreate({
					contentType: "route",
					draftJobId: publishJobId ? null : draftJobId,
					sourceJobId: publishJobId,
					payload: { route: queuedRoute },
					draft: { route: queuedRoute },
					media: queued.media.map((item) => ({
						...durableMediaForUri(item.uri),
						slot: item.slot,
					})),
				});
				markDurableImagesEnqueued();
				revokeRouteObjectUrls(tripDays);
				allowLeaveRef.current = true;
				navigation.goBack();
				return;
			}

			const preparedMedia = await prepareRouteMedia(tripDays, uploadImageAssets);
			routeData.days = preparedMedia.days;

			await saveRoute(routeData, routeToEdit?.id || null);
			Alert.alert("הצלחה", "המסלול עודכן.");
			revokeRouteObjectUrls(tripDays);
			allowLeaveRef.current = true;
			navigation.goBack();
		} catch (error) {
			const locationKind = locationErrorKind(error);
			if (locationKind !== "unknown") {
				console.info("route_save_location_failure", { kind: locationKind });
			} else {
				console.info("route_save_failure", { code: String(error?.code || "unknown") });
			}
			// Unclaimed prepared media is removed by the scheduled server cleanup.
			Alert.alert(
				locationKind === "quota" ? "מגבלת חיפוש זמנית" : "שגיאה",
				locationKind === "unknown"
					? "לא הצלחנו לשמור את המסלול."
					: locationErrorMessage(error)
			);
		} finally {
			setSubmitting(false);
		}
	};

	const currentStep = Math.max(1, ROUTE_SECTION_ORDER.indexOf(expandedSection) + 1);
	const basicsSummary = title.trim()
		? `${title.trim()}${days ? ` · ${days} ימים` : ""}`
		: "שם, משך, מרחק ותיאור";
	const daysSummary = tripDays.length
		? `${tripDays.length} ימים · ${validStops.length} תחנות`
		: "בונים כל יום בנפרד";
	const categorySummary = categoryIds.length
		? `${categoryIds.length} קטגוריות · ${subcategoryIds.length} תתי־קטגוריות`
		: "מה מחכה בדרך";
	const budgetLabel = POST_BUDGETS.find((item) => item.value === budgetLevel)?.postLabel || "";
	const fitSummary = [
		budgetLabel,
		audienceScope === "all" ? "מתאים לכולם" : (audiences.length ? `${audiences.length} קהלים` : ""),
	].filter(Boolean).join(" · ") || "התאמה, קושי וסגנון";

	return (
		<View style={[common.container, guidedStyles.screen]}>
			<ScrollView
				ref={scrollRef}
				style={guidedStyles.scroll}
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={guidedStyles.content}
			>
				<GuidedFormHeader
					currentStep={currentStep}
					totalSteps={ROUTE_SECTION_ORDER.length}
					title={routeToEdit ? "עריכת מסלול" : "מסלול חדש"}
					intro="מתחילים מהתמונה הגדולה, מסדרים את הימים ורק אז מדייקים למי המסלול מתאים."
					testID="route-guided-header"
				/>

				<View onLayout={(event) => { sectionLayoutsRef.current.basics = event.nativeEvent.layout.y; }}>
					<GuidedFormSection
						id="basics"
						index={1}
						title="המסלול בקצרה"
						summary={basicsSummary}
						expanded={expandedSection === "basics"}
						completed={sectionIsComplete("basics")}
						errorCount={sectionErrorCount(validation, "basics")}
						onToggle={() => setExpandedSection((current) => current === "basics" ? null : "basics")}
						onContinue={() => continueFromSection("basics")}
						testIDPrefix="route-section"
					>
						<FormInput label="כותרת המסלול" required rtl placeholder="לדוגמה: מסלול טבע בנורבגיה" value={title} onChangeText={setTitle} error={validation.fields.title} testID="route-title-input" />
						<FormInput label="מספר ימים" required rtl helperText="ניצור כרטיס נפרד לכל יום." placeholder="לדוגמה: 4" value={days} onChangeText={setDays} keyboardType="numeric" error={validation.fields.days} testID="route-days-input" />
						<FormInput label="מרחק משוער (ק״מ)" required rtl placeholder="לדוגמה: 120" value={distance} onChangeText={setDistance} keyboardType="numeric" error={validation.fields.distance} testID="route-distance-input" />
						<FormInput label="תיאור המסלול" required rtl placeholder="מה הופך את המסלול למיוחד?" value={desc} onChangeText={setDesc} multiline numberOfLines={4} error={validation.fields.desc} testID="route-description-input" />
					</GuidedFormSection>
				</View>

				<View onLayout={(event) => { sectionLayoutsRef.current.days = event.nativeEvent.layout.y; }}>
					<GuidedFormSection
						id="days"
						index={2}
						title="ימים ותחנות"
						summary={daysSummary}
						expanded={expandedSection === "days"}
						completed={sectionIsComplete("days")}
						errorCount={sectionErrorCount(validation, "days")}
						onToggle={() => setExpandedSection((current) => current === "days" ? null : "days")}
						onContinue={() => continueFromSection("days")}
						continueLabel="המשך לקטגוריות"
						testIDPrefix="route-section"
					>
						<AppText style={guidedStyles.fieldHelper}>פתחו כל יום והוסיפו את התחנות לפי סדר הביקור. אפשר לחזור ולערוך בכל רגע.</AppText>
						<DayList days={tripDays} onEdit={openDayEditor} />
						{!!validation.fields.stops && <AppText style={guidedStyles.fieldError}>{validation.fields.stops}</AppText>}
					</GuidedFormSection>
				</View>

				<View onLayout={(event) => { sectionLayoutsRef.current.category = event.nativeEvent.layout.y; }}>
					<GuidedFormSection
						id="category"
						index={3}
						title="מה יש במסלול"
						summary={categorySummary}
						expanded={expandedSection === "category"}
						completed={sectionIsComplete("category")}
						errorCount={sectionErrorCount(validation, "category")}
						onToggle={() => setExpandedSection((current) => current === "category" ? null : "category")}
						onContinue={() => continueFromSection("category")}
						continueLabel="המשך להתאמה"
						testIDPrefix="route-section"
					>
						<RtlChoiceGroup
							label="קטגוריות במסלול (חובה)"
							helper="אפשר לבחור כמה תחומים; בגלילה מתחילים תמיד מימין."
							options={CATEGORIES}
							selectedIds={categoryIds}
							onToggle={(id) => {
								if (categoryIds.includes(id)) {
									setSubcategoryIds((current) => current.filter((tagId) => !(TAG_OPTIONS_BY_CATEGORY[id] || []).some((tag) => tag.id === tagId)));
								}
								toggle(setCategoryIds, id, 8);
							}}
							maxSelected={8}
							variant="tile"
							layout="responsive"
							error={validation.fields.categoryIds}
							testIDPrefix="route-category"
						/>
						{categoryIds.map((categoryId) => (
							<View style={guidedStyles.nestedPanel} key={categoryId}>
								<AppText style={guidedStyles.nestedTitle}>תתי־קטגוריות · {CATEGORIES.find((item) => item.id === categoryId)?.label || ""}</AppText>
								<RtlChoiceGroup
									options={TAG_OPTIONS_BY_CATEGORY[categoryId] || []}
									selectedIds={subcategoryIds}
									onToggle={(id) => toggle(setSubcategoryIds, id, 20)}
									maxSelected={20}
									testIDPrefix={`route-subcategory-${categoryId}`}
								/>
							</View>
						))}
						{!!validation.fields.subcategoryIds && <AppText style={guidedStyles.fieldError}>{validation.fields.subcategoryIds}</AppText>}
					</GuidedFormSection>
				</View>

				<View onLayout={(event) => { sectionLayoutsRef.current.fit = event.nativeEvent.layout.y; }}>
					<GuidedFormSection
						id="fit"
						index={4}
						title="קהל ומאפיינים"
						summary={fitSummary}
						expanded={expandedSection === "fit"}
						completed={sectionIsComplete("fit")}
						errorCount={sectionErrorCount(validation, "fit")}
						onToggle={() => setExpandedSection((current) => current === "fit" ? null : "fit")}
						testIDPrefix="route-section"
					>
						<RtlChoiceGroup label="היקף התאמה לקהל (חובה)" options={[{ id: "all", label: "מתאים לכולם" }, { id: "selected", label: "בחירת קהלים" }]} selectedIds={[audienceScope]} selectionMode="single" variant="segment" onToggle={(id) => { setAudienceScope(id); if (id === "all") setAudiences([]); }} testIDPrefix="route-audience-scope" />
						{audienceScope === "selected" ? <RtlChoiceGroup label="קהל יעד (חובה)" options={TRAVEL_PARTIES} selectedIds={audiences} onToggle={(id) => toggle(setAudiences, id, 6)} maxSelected={6} error={validation.fields.audiences} testIDPrefix="route-audience" /> : null}
						<RtlChoiceGroup label="רמת מחיר (חובה)" options={POST_BUDGETS} selectedIds={[budgetLevel]} selectionMode="single" variant="segment" onToggle={setBudgetLevel} error={validation.fields.budgetLevel} testIDPrefix="route-budget" />
						<RtlChoiceGroup label="רמת קושי (חובה)" options={ROUTE_DIFFICULTIES} selectedIds={[difficulty]} selectionMode="single" onToggle={setDifficulty} error={validation.fields.difficulty} testIDPrefix="route-difficulty" />
						<RtlChoiceGroup label="אמצעי התניידות (חובה)" options={TRANSPORT_MODES} selectedIds={transportModes} onToggle={(id) => toggle(setTransportModes, id, 4)} maxSelected={4} error={validation.fields.transportModes} testIDPrefix="route-transport" />
						<RtlChoiceGroup label="קצב (חובה)" options={PACES} selectedIds={[pace]} selectionMode="single" onToggle={setPace} error={validation.fields.pace} testIDPrefix="route-pace" />
						<RtlChoiceGroup label="עונה מתאימה (חובה)" options={SEASONS} selectedIds={seasons} onToggle={(id) => toggle(setSeasons, id, 6)} maxSelected={6} error={validation.fields.seasons} testIDPrefix="route-season" />
						<RtlChoiceGroup label="סביבה עיקרית (חובה)" options={ENVIRONMENTS} selectedIds={[environment]} selectionMode="single" onToggle={setEnvironment} error={validation.fields.environment} testIDPrefix="route-environment" />

						<TouchableOpacity style={guidedStyles.optionalToggle} onPress={() => setOptionalFitOpen((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: optionalFitOpen }} testID="route-optional-toggle">
							<AppText style={guidedStyles.optionalToggleText}>עוד פרטים שיעזרו למטיילים (רשות)</AppText>
							<AppText style={guidedStyles.optionalToggleText}>{optionalFitOpen ? "−" : "+"}</AppText>
						</TouchableOpacity>
						{optionalFitOpen ? (
							<View>
								<RtlChoiceGroup label="ניסיון נדרש" options={ROUTE_EXPERIENCE_LEVELS} selectedIds={[experienceLevel]} selectionMode="single" onToggle={setExperienceLevel} testIDPrefix="route-experience" />
								<RtlChoiceGroup label="אווירה" options={VIBES} selectedIds={vibes} onToggle={(id) => toggle(setVibes, id, 4)} maxSelected={4} testIDPrefix="route-vibe" />
								<RtlChoiceGroup label="סגנון טיול" options={TRAVELER_STYLES} selectedIds={travelerStyles} onToggle={(id) => toggle(setTravelerStyles, id, 4)} maxSelected={4} testIDPrefix="route-style" />
								<RtlChoiceGroup label="מידע מעשי ונגישות" options={NEEDS} selectedIds={needs} onToggle={(id) => toggle(setNeeds, id, NEEDS.length)} maxSelected={NEEDS.length} testIDPrefix="route-need" />
								{needs.length > 0 ? (
									<TouchableOpacity style={guidedStyles.checkboxRow} onPress={() => setNeedsCoverageConfirmed((current) => !current)} accessibilityRole="checkbox" accessibilityState={{ checked: needsCoverageConfirmed }} testID="route-needs-coverage-confirmation">
										<View style={[guidedStyles.checkboxBox, needsCoverageConfirmed && guidedStyles.checkboxBoxChecked]}>{needsCoverageConfirmed ? <AppText style={guidedStyles.checkboxCheck}>✓</AppText> : null}</View>
										<AppText style={guidedStyles.checkboxText}>בדקתי שהמידע שסומן נכון לכל המסלול, ולא רק לחלק מהתחנות.</AppText>
									</TouchableOpacity>
								) : null}
								{!!validation.fields.needsCoverageConfirmed && <AppText style={guidedStyles.fieldError}>{validation.fields.needsCoverageConfirmed}</AppText>}
							</View>
						) : null}
					</GuidedFormSection>
				</View>
			</ScrollView>

			<GuidedFormFooter label={routeToEdit ? "שמור שינויים" : "פרסם מסלול"} onPress={addRoute} loading={submitting} disabled={submitting} testID="route-submit" />

			<DayEditorModal
				visible={isDayModalVisible}
				onClose={() => setDayModalVisible(false)}
				onSave={handleSaveDay}
				dayIndex={editingDayIndex !== null ? editingDayIndex : 0}
				initialData={editingDayIndex !== null ? tripDays[editingDayIndex] : {}}
				onPersistImage={async (uri) => { await persistReviewedImages([uri]); }}
				onForgetImage={forgetDurableImage}
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
