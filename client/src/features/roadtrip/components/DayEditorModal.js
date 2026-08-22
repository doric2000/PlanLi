import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Alert, Modal, SafeAreaView, ScrollView, TouchableOpacity, View } from "react-native";
import AppText from "../../../components/AppText";

import CachedImage from "../../../components/CachedImage";
import { FormInput } from "../../../components/FormInput";
import { ImagePickerBox } from "../../../components/ImagePickerBox";
import ImageCropReviewModal from "../../../components/ImageCropReviewModal";
import {
	ROUTE_IMAGE_LONG_EDGE,
	TRAVEL_IMAGE_COMPRESSION,
} from "../../../constants/travelMedia";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import useReviewedImagePicker from "../../../hooks/useReviewedImagePicker";
import { getMediaVariantUrl } from "../../../utils/mediaAssets";
import { getStopCoordinates } from "../utils/routeStops";
import { dayEditorModalStyles as styles } from "../../../styles";
import StopEditorModal from "./StopEditorModal";

function buildDayComparable({ description, image, stops }) {
	return JSON.stringify({
		d: (description || "").trim(),
		i: image || null,
		s: (stops || []).map((stop) => {
			const coords = getStopCoordinates(stop);
			return {
				id: stop.id || "",
				t: (stop.title || "").trim(),
				desc: (stop.description || "").trim(),
				i: stop.image || null,
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
	visible, onClose, onSave, initialData, dayIndex, onPersistImage, onForgetImage,
	routeDestination, allowImages = true,
}) {
	const [description, setDescription] = useState("");
	const [stops, setStops] = useState([]);
	const [stopModalVisible, setStopModalVisible] = useState(false);
	const [editingStopIndex, setEditingStopIndex] = useState(null);
	const [dayBaseline, setDayBaseline] = useState(null);
	const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);
	const pendingDiscardRef = useRef(null);

	const {
		imageUri: image,
		setImageUri: setImage,
		pickOneForReview,
		clearImage,
		cancelReview,
		completeReview,
		reviewUris,
		uploading,
	} = useReviewedImagePicker({
		kind: "route",
		quality: 1,
		maxLongEdge: ROUTE_IMAGE_LONG_EDGE,
		normalizeCompress: TRAVEL_IMAGE_COMPRESSION,
		processOnSelect: false,
	});

	useEffect(() => {
		if (!visible) {
			setDayBaseline(null);
			setUnsavedModalVisible(false);
			pendingDiscardRef.current = null;
			return;
		}
		const desc0 = initialData?.description || "";
		const img0 =
			initialData?.image ||
			getMediaVariantUrl(initialData?.media, "feed") ||
			null;
		const stops0 = Array.isArray(initialData?.stops) ? initialData.stops : [];
		setDescription(desc0);
		setImage(img0);
		setStops(stops0);
		setEditingStopIndex(null);
		setStopModalVisible(false);
		setDayBaseline(buildDayComparable({ description: desc0, image: img0, stops: stops0 }));
	}, [visible, initialData, setImage]);

	const dayFormComparable = useMemo(
		() => buildDayComparable({ description, image, stops }),
		[description, image, stops]
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
		if (uploading) return;
		if (!hasUnsavedChanges) {
			onClose();
			return;
		}
		pendingDiscardRef.current = () => onClose();
		setUnsavedModalVisible(true);
	}, [uploading, hasUnsavedChanges, onClose]);

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
					Promise.resolve(onForgetImage?.(prev[index]?.image)).catch(() => {});
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
		if (uploading) {
			Alert.alert("רק רגע", "התמונה עדיין עולה.");
			return;
		}
		onSave({
			description,
			image,
			media:
				image &&
				image ===
					(initialData?.image ||
						getMediaVariantUrl(initialData?.media, "feed"))
					? initialData?.media || null
					: null,
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
					<TouchableOpacity onPress={tryClose} disabled={uploading}>
						<AppText style={styles.headerBtn}>ביטול</AppText>
					</TouchableOpacity>
					<AppText style={styles.headerTitle}>יום {dayIndex + 1}</AppText>
					<TouchableOpacity onPress={handleSave} disabled={uploading}>
						<AppText style={[styles.headerBtn, styles.headerBtnStrong, uploading && styles.headerBtnDisabled]}>
							שמירה
						</AppText>
					</TouchableOpacity>
				</View>

				<ScrollView
					style={styles.content}
					contentContainerStyle={styles.scrollContent}
					keyboardShouldPersistTaps="handled"
				>
					<FocusClearingFormInput
						label="תיאור היום (רשות)"
						helperText="אפשר לכתוב בקצרה; את סדר הביקור מנהלים בעצירות שמתחת."
						placeholder="למשל: יום רגוע במרכז העיר עם אוכל, שוק ותצפית"
						value={description}
						onChangeText={setDescription}
						multiline
						style={styles.descriptionInput}
						rtl
					/>

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

					{allowImages ? <><AppText style={styles.photoLabel}>תיעוד מהיום</AppText>
					<ImagePickerBox
						imageUri={image}
						onPress={() => pickOneForReview(async (uri) => {
							await onPersistImage?.(uri);
							await onForgetImage?.(image);
							setImage(uri);
						})}
						onRemove={() => {
							Promise.resolve(onForgetImage?.(image)).catch(() => {});
							clearImage();
						}}
						maxImages={1}
						placeholderText={uploading ? "מעלה תמונה..." : "הוסף תמונה"}
						style={styles.imagePickerSpacing}
						loading={uploading}
					/></> : null}
				</ScrollView>

				<StopEditorModal
					visible={stopModalVisible}
					onClose={() => setStopModalVisible(false)}
					onSave={handleSaveStop}
					initialData={editingStopIndex !== null ? stops[editingStopIndex] : null}
					dayIndex={dayIndex}
					stopIndex={editingStopIndex !== null ? editingStopIndex : stops.length}
					onPersistImage={onPersistImage}
					onForgetImage={onForgetImage}
					routeDestination={routeDestination}
					allowImages={allowImages}
				/>
				<ImageCropReviewModal
					visible={reviewUris.length > 0}
					uris={reviewUris}
					aspect={[4, 3]}
					maxLongEdge={ROUTE_IMAGE_LONG_EDGE}
					compress={TRAVEL_IMAGE_COMPRESSION}
					onCancel={cancelReview}
					onComplete={completeReview}
				/>
			</SafeAreaView>
		</Modal>
	);
}
