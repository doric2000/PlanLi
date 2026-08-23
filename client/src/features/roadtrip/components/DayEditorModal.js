import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Alert, Modal, SafeAreaView, ScrollView, TouchableOpacity, View } from "react-native";
import AppText from "../../../components/AppText";

import CachedImage from "../../../components/CachedImage";
import { FormInput } from "../../../components/FormInput";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import { getMediaVariantUrl } from "../../../utils/mediaAssets";
import { getStopCoordinates, getStopMediaUrls } from "../utils/routeStops";
import { dayEditorModalStyles as styles } from "../../../styles";
import StopEditorModal from "./StopEditorModal";

function buildDayComparable({ description, stops }) {
	return JSON.stringify({
		d: (description || "").trim(),
		s: (stops || []).map((stop) => {
			const coords = getStopCoordinates(stop);
			return {
				id: stop.id || "",
				t: (stop.title || "").trim(),
				desc: (stop.description || "").trim(),
				media: getStopMediaUrls(stop, "feed"),
				lat: coords?.lat ?? null,
				lng: coords?.lng ?? null,
				placeId: stop.place?.placeId || stop.placeId || null,
				locationPrecision: stop.locationPrecision || null,
				destination: stop.destination?.countryId && stop.destination?.cityId
					? `${stop.destination.countryId}/${stop.destination.cityId}`
					: null,
				startTime: stop.startTime || "",
				durationMinutes: stop.durationMinutes || null,
				recommendationId: stop.source?.recommendationId || null,
			};
		}),
	});
}

function FocusClearingFormInput({ placeholder, onFocus, onBlur, ...props }) {
	const [focused, setFocused] = useState(false);
	return <FormInput {...props} placeholder={focused ? "" : placeholder} onFocus={(event) => {
		setFocused(true); onFocus?.(event);
	}} onBlur={(event) => { setFocused(false); onBlur?.(event); }} />;
}

export default function DayEditorModal({
	visible, onClose, onSave, initialData, dayIndex, onForgetImage,
	routeDestination, allowStopImages = true,
}) {
	const [description, setDescription] = useState("");
	const [dayNoteOpen, setDayNoteOpen] = useState(false);
	const [stops, setStops] = useState([]);
	const [stopModalVisible, setStopModalVisible] = useState(false);
	const [editingStopIndex, setEditingStopIndex] = useState(null);
	const [dayBaseline, setDayBaseline] = useState(null);
	const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);
	const pendingDiscardRef = useRef(null);

	useEffect(() => {
		if (!visible) {
			setDayBaseline(null);
			setUnsavedModalVisible(false);
			pendingDiscardRef.current = null;
			return;
		}
		const desc0 = initialData?.description || "";
		const stops0 = Array.isArray(initialData?.stops) ? initialData.stops : [];
		setDescription(desc0);
		setDayNoteOpen(Boolean(desc0));
		setStops(stops0);
		setEditingStopIndex(null);
		setStopModalVisible(false);
		setDayBaseline(buildDayComparable({ description: desc0, stops: stops0 }));
	}, [visible, initialData]);

	const dayFormComparable = useMemo(
		() => buildDayComparable({ description, stops }),
		[description, stops]
	);

	const hasUnsavedChanges = dayBaseline != null && dayFormComparable !== dayBaseline;

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

	const tryClose = useCallback(() => {
		if (!hasUnsavedChanges) {
			onClose();
			return;
		}
		pendingDiscardRef.current = () => onClose();
		setUnsavedModalVisible(true);
	}, [hasUnsavedChanges, onClose]);

	const handleSaveStop = (stopData, index) => {
		setStops((prev) => {
			const next = [...prev];
			if (index >= next.length) {
				next.push(stopData);
			} else {
				next[index] = stopData;
			}
			return next;
		});
	};

	const handleDeleteStop = (index) => {
		Alert.alert("מחיקת עצירה", `להסיר את העצירה מספר ${index + 1}?`, [
			{ text: "ביטול", style: "cancel" },
			{
				text: "מחק",
				style: "destructive",
				onPress: () => setStops((prev) => {
					getStopMediaUrls(prev[index]).forEach((uri) => {
						if (/^(file:|blob:|content:|ph:|assets-library:)/i.test(uri)) {
							Promise.resolve(onForgetImage?.(uri)).catch(() => {});
						}
					});
					return prev.filter((_, i) => i !== index);
				}),
			},
		]);
	};

	const handleSave = () => {
		if (!description && stops.length === 0) {
			Alert.alert("חסר תוכן", "כדאי להוסיף תיאור או לפחות עצירה אחת ליום.");
			return;
		}
		onSave({
			description,
			image: initialData?.image || null,
			media: initialData?.media || null,
			stops,
		}, dayIndex);
		setUnsavedModalVisible(false);
		pendingDiscardRef.current = null;
		onClose();
	};

	return (
		<Modal visible={visible} animationType="fade" presentationStyle="pageSheet" onRequestClose={tryClose}>
			<SafeAreaView style={styles.container}>
				<UnsavedChangesModal
					visible={unsavedModalVisible}
					contained
					title={UNSAVED_LEAVE_TITLE}
					message={UNSAVED_LEAVE_MESSAGE}
					onCancel={dismissUnsavedModal}
					onConfirm={confirmUnsavedLeave}
					testID="day-editor-unsaved-modal"
					cancelTestID="day-editor-unsaved-cancel"
					confirmTestID="day-editor-unsaved-confirm"
				/>
				<View style={styles.header}>
					<TouchableOpacity onPress={tryClose}>
						<AppText style={styles.headerBtn}>ביטול</AppText>
					</TouchableOpacity>
					<AppText style={styles.headerTitle}>יום {dayIndex + 1}</AppText>
					<TouchableOpacity onPress={handleSave}>
						<AppText style={[styles.headerBtn, styles.headerBtnStrong]}>
							שמירה
						</AppText>
					</TouchableOpacity>
				</View>

				<ScrollView
					style={styles.content}
					contentContainerStyle={styles.scrollContent}
					keyboardShouldPersistTaps="handled"
				>
					{dayNoteOpen ? <View style={styles.dayNoteWrap}>
						<FocusClearingFormInput
							label="הערה ליום (רשות)"
							helperText="רק אם יש משהו כללי שלא שייך לעצירה מסוימת."
							placeholder="למשל: יום רגוע באזור העיר העתיקה"
							value={description}
							onChangeText={setDescription}
							multiline
							style={styles.descriptionInput}
							rtl
						/>
						<TouchableOpacity onPress={() => { setDescription(""); setDayNoteOpen(false); }} style={styles.removeDayNote} testID="route-day-note-remove">
							<AppText style={styles.removeDayNoteText}>הסרת ההערה</AppText>
						</TouchableOpacity>
					</View> : <TouchableOpacity onPress={() => setDayNoteOpen(true)} style={styles.addDayNote} testID="route-day-note-add">
						<AppText style={styles.addDayNoteText}>הוספת הערה ליום</AppText>
					</TouchableOpacity>}

					<View style={styles.stopsSection}>
						<View style={styles.stopsHeader}>
							<TouchableOpacity
								onPress={() => {
									setEditingStopIndex(stops.length);
									setStopModalVisible(true);
								}}
								style={styles.addStopButton}
							>
								<AppText style={styles.addStopText}>הוספת עצירה</AppText>
							</TouchableOpacity>
							<AppText style={styles.stopsTitle}>עצירות ביום הזה</AppText>
						</View>

						{stops.length === 0 ? (
							<AppText style={styles.emptyStopsText}>
								עדיין אין עצירות. אפשר להוסיף מקום מדויק, נקודה במפה או מיקום כללי.
							</AppText>
						) : (
							stops.map((stop, index) => (
								<TouchableOpacity
									key={stop.id || `${stop.title}:${index}`}
									style={styles.stopCard}
									activeOpacity={0.85}
									onPress={() => {
										setEditingStopIndex(index);
										setStopModalVisible(true);
									}}
								>
									{stop.image || stop.media ? (
										<CachedImage
											source={{
												uri: getMediaVariantUrl(
													stop.media,
													"thumb",
													stop.image
												),
											}}
											style={styles.stopThumb}
											contentFit="cover"
											priority="low"
										/>
									) : (
										<View style={styles.stopNumberBadge}>
											<AppText style={styles.stopNumberText}>{index + 1}</AppText>
										</View>
									)}
									<View style={styles.stopTextWrap}>
										<AppText style={styles.stopTitle} numberOfLines={1}>
											{stop.title}
										</AppText>
										<AppText style={styles.stopMeta} numberOfLines={1}>
											{stop.location || stop.place?.name || stop.place?.address}
										</AppText>
									</View>
									<TouchableOpacity
										onPress={(event) => {
											event.stopPropagation?.();
											handleDeleteStop(index);
										}}
										style={styles.deleteStopButton}
									>
										<AppText style={styles.deleteStopText}>הסרה</AppText>
									</TouchableOpacity>
								</TouchableOpacity>
							))
						)}
					</View>

				</ScrollView>

				<StopEditorModal
					visible={stopModalVisible}
					onClose={() => setStopModalVisible(false)}
					onSave={handleSaveStop}
					initialData={editingStopIndex !== null ? stops[editingStopIndex] : null}
					dayIndex={dayIndex}
					stopIndex={editingStopIndex !== null ? editingStopIndex : stops.length}
					onForgetImage={onForgetImage}
					routeDestination={routeDestination}
					allowImages={allowStopImages}
				/>
			</SafeAreaView>
		</Modal>
	);
}
