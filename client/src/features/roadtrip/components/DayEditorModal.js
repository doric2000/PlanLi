import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Alert, Modal, SafeAreaView, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
	NestableDraggableFlatList,
	NestableScrollContainer,
	ScaleDecorator,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AppText from "../../../components/AppText";

import CachedImage from "../../../components/CachedImage";
import { FormInput } from "../../../components/FormInput";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import { getMediaVariantUrl } from "../../../utils/mediaAssets";
import { getStopCoordinates, getStopMediaUrls } from "../utils/routeStops";
import { colors, dayEditorModalStyles as styles } from "../../../styles";
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
	visible, onClose, onSave, initialData, dayIndex, onForgetImage, onPersistImages, mediaForImage,
	routeDestination, allowStopImages = true, initialInsertIndex = null,
}) {
	const [description, setDescription] = useState("");
	const [dayNoteOpen, setDayNoteOpen] = useState(false);
	const [stops, setStops] = useState([]);
	const [stopModalVisible, setStopModalVisible] = useState(false);
	const [editingStopIndex, setEditingStopIndex] = useState(null);
	const [insertingStop, setInsertingStop] = useState(false);
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
		if (Number.isInteger(initialInsertIndex)) {
			setEditingStopIndex(Math.max(0, Math.min(initialInsertIndex, stops0.length)));
			setInsertingStop(true);
			setStopModalVisible(true);
		} else {
			setEditingStopIndex(null);
			setInsertingStop(false);
			setStopModalVisible(false);
		}
		setDayBaseline(buildDayComparable({ description: desc0, stops: stops0 }));
	}, [visible, initialData, initialInsertIndex]);

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
		const next = [...stops];
		if (insertingStop) {
			next.splice(Math.max(0, Math.min(index, next.length)), 0, stopData);
		} else if (index >= next.length) {
			next.push(stopData);
		} else {
			next[index] = stopData;
		}
		setStops(next);
		setInsertingStop(false);
	};

	const closeStopEditor = () => {
		setStopModalVisible(false);
	};

	const openNewStopAt = (index) => {
		setEditingStopIndex(Math.max(0, Math.min(index, stops.length)));
		setInsertingStop(true);
		setStopModalVisible(true);
	};

	const moveStop = (from, to) => setStops((current) => {
		if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
		const next = [...current];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		return next;
	});

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
			<GestureHandlerRootView style={styles.container}>
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

				<NestableScrollContainer
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
								onPress={() => openNewStopAt(stops.length)}
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
							<>
								<AppText style={styles.reorderHint}>לחיצה ארוכה על הידית וגרירה משנה את הסדר</AppText>
								<NestableDraggableFlatList
									data={stops}
									keyExtractor={(stop, index) => stop.id || `${stop.title}:${index}`}
									activationDistance={8}
									onDragEnd={({ data }) => setStops(data)}
									testID="day-stop-draggable-list"
									renderItem={({ item: stop, index, drag, isActive }) => (
										<View>
											{index > 0 ? <TouchableOpacity style={styles.insertStopButton} onPress={() => openNewStopAt(index)} testID={`day-insert-stop-${index}`}>
												<Ionicons name="add-circle-outline" size={18} color={colors.brandOrange} />
												<AppText style={styles.insertStopText}>הוספת עצירה כאן</AppText>
											</TouchableOpacity> : null}
											<ScaleDecorator activeScale={1.02}>
												<TouchableOpacity
													style={[styles.stopCard, isActive && styles.stopCardDragging]}
													activeOpacity={0.85}
													disabled={isActive}
													onPress={() => {
														setEditingStopIndex(index);
														setInsertingStop(false);
														setStopModalVisible(true);
													}}
													testID={`day-stop-edit-${index}`}
												>
													{stop.image || stop.media ? (
														<CachedImage source={{ uri: getMediaVariantUrl(stop.media, "thumb", stop.image) }} style={styles.stopThumb} contentFit="cover" priority="low" />
													) : <View style={styles.stopNumberBadge}><AppText style={styles.stopNumberText}>{index + 1}</AppText></View>}
													<View style={styles.stopTextWrap}>
														<AppText style={styles.stopTitle} numberOfLines={1}>{stop.title}</AppText>
														<AppText style={styles.stopMeta} numberOfLines={1}>{stop.location || stop.place?.name || stop.place?.address}</AppText>
													</View>
													<TouchableOpacity onPress={(event) => { event.stopPropagation?.(); handleDeleteStop(index); }} style={styles.deleteStopButton}><AppText style={styles.deleteStopText}>הסרה</AppText></TouchableOpacity>
													<TouchableOpacity
														style={styles.dragHandle}
														onLongPress={drag}
														delayLongPress={180}
														onPress={(event) => event.stopPropagation?.()}
														accessibilityLabel={`שינוי מיקום העצירה ${index + 1}`}
														accessibilityHint="לחיצה ארוכה וגרירה משנה את הסדר"
														accessibilityActions={[
															...(index > 0 ? [{ name: "moveUp", label: "העברה למעלה" }] : []),
															...(index < stops.length - 1 ? [{ name: "moveDown", label: "העברה למטה" }] : []),
														]}
														onAccessibilityAction={({ nativeEvent }) => {
															if (nativeEvent.actionName === "moveUp") moveStop(index, index - 1);
															if (nativeEvent.actionName === "moveDown") moveStop(index, index + 1);
														}}
														testID={`day-stop-drag-handle-${index}`}
													><Ionicons name="reorder-three-outline" size={27} color={colors.primary} /></TouchableOpacity>
												</TouchableOpacity>
											</ScaleDecorator>
										</View>
									)}
								/>
							</>
						)}
					</View>

				</NestableScrollContainer>

				<StopEditorModal
					visible={stopModalVisible}
					onClose={closeStopEditor}
					onSave={handleSaveStop}
					initialData={!insertingStop && editingStopIndex !== null ? stops[editingStopIndex] : null}
					dayIndex={dayIndex}
					stopIndex={editingStopIndex !== null ? editingStopIndex : stops.length}
					onForgetImage={onForgetImage}
					onPersistImages={onPersistImages}
					mediaForImage={mediaForImage}
					routeDestination={routeDestination}
					allowImages={allowStopImages}
				/>
			</SafeAreaView>
			</GestureHandlerRootView>
		</Modal>
	);
}
