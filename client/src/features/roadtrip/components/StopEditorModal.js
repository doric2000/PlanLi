import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";

import ExactLocationPicker from "../../../components/ExactLocationPicker";
import { FormInput } from "../../../components/FormInput";
import { ImagePickerBox } from "../../../components/ImagePickerBox";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import { useImagePickerWithUpload } from "../../../hooks/useImagePickerWithUpload";
import { hasValidStopLocation, getStopCoordinates } from "../utils/routeStops";
import { stopEditorModalStyles as styles } from "../../../styles";

const createStopId = () => `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function buildStopComparable({ title, description, image, locationValue }) {
	const merged = { ...(locationValue || {}), title, description, image };
	const coords = getStopCoordinates(merged);
	return JSON.stringify({
		title: (title || "").trim(),
		description: (description || "").trim(),
		image: image || null,
		lat: coords?.lat ?? null,
		lng: coords?.lng ?? null,
		placeId: merged.place?.placeId ?? merged.placeId ?? null,
	});
}

export default function StopEditorModal({
	visible,
	onClose,
	onSave,
	initialData,
	dayIndex,
	stopIndex,
}) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [locationValue, setLocationValue] = useState(null);
	const [stopBaseline, setStopBaseline] = useState(null);
	const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);
	const pendingDiscardRef = useRef(null);
	const {
		imageUri: image,
		setImageUri: setImage,
		pickImageAndUpload,
		clearImage,
		uploading,
	} = useImagePickerWithUpload({
		storagePath: "trips/stops",
	});

	useEffect(() => {
		if (!visible) {
			setStopBaseline(null);
			setUnsavedModalVisible(false);
			pendingDiscardRef.current = null;
			return;
		}
		const t = initialData?.title || "";
		const d = initialData?.description || "";
		const im = initialData?.image || null;
		const loc = initialData || null;
		setTitle(t);
		setDescription(d);
		setImage(im);
		setLocationValue(loc);
		setStopBaseline(
			buildStopComparable({ title: t, description: d, image: im, locationValue: loc })
		);
	}, [visible, initialData, setImage]);

	const stopFormComparable = useMemo(
		() => buildStopComparable({ title, description, image, locationValue }),
		[title, description, image, locationValue]
	);

	const hasUnsavedChanges = stopBaseline != null && stopFormComparable !== stopBaseline;

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
			onClose?.();
			return;
		}
		pendingDiscardRef.current = () => onClose?.();
		setUnsavedModalVisible(true);
	}, [uploading, hasUnsavedChanges, onClose]);

	const handleSave = () => {
		const trimmedTitle = title.trim();
		if (!trimmedTitle) {
			Alert.alert("חסר שם תחנה", "הוסף שם קצר לתחנה.");
			return;
		}
		if (uploading) {
			Alert.alert("רק רגע", "התמונה עדיין בהעלאה.");
			return;
		}

		const nextStop = {
			...(initialData || {}),
			...(locationValue || {}),
			id: initialData?.id || createStopId(),
			title: trimmedTitle,
			description: description.trim(),
			image: image || null,
		};

		if (!hasValidStopLocation(nextStop)) {
			Alert.alert("חסר מיקום מדויק", "בחר מיקום עם נקודה במפה לפני שמירת התחנה.");
			return;
		}

		onSave?.(nextStop, stopIndex);
		setUnsavedModalVisible(false);
		pendingDiscardRef.current = null;
		onClose?.();
	};

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={tryClose}>
			<View style={styles.container}>
				<UnsavedChangesModal
					visible={unsavedModalVisible}
					title={UNSAVED_LEAVE_TITLE}
					message={UNSAVED_LEAVE_MESSAGE}
					onCancel={dismissUnsavedModal}
					onConfirm={confirmUnsavedLeave}
					testID="stop-editor-unsaved-modal"
					cancelTestID="stop-editor-unsaved-cancel"
					confirmTestID="stop-editor-unsaved-confirm"
				/>
				<View style={styles.header}>
					<TouchableOpacity onPress={tryClose} disabled={uploading}>
						<Text style={styles.headerButton}>ביטול</Text>
					</TouchableOpacity>
					<Text style={styles.headerTitle}>
						יום {dayIndex + 1} · תחנה {stopIndex + 1}
					</Text>
					<TouchableOpacity onPress={handleSave} disabled={uploading}>
						<Text style={[styles.headerButton, styles.headerButtonStrong]}>
							שמור
						</Text>
					</TouchableOpacity>
				</View>

				<ScrollView
					style={styles.content}
					contentContainerStyle={styles.scrollContent}
					keyboardShouldPersistTaps="handled"
				>
					<FormInput
						label="שם התחנה"
						placeholder="למשל: תצפית, מסעדה, מפל..."
						value={title}
						onChangeText={setTitle}
						textAlign="right"
						testID="route-stop-title-input"
					/>

					<View style={styles.locationWrap}>
						<ExactLocationPicker
							value={locationValue}
							onChange={setLocationValue}
							inputTestID="route-stop-location-input"
						/>
					</View>

					<FormInput
						label="תיאור התחנה"
						placeholder="מה עושים כאן? כמה זמן לעצור?"
						value={description}
						onChangeText={setDescription}
						multiline
						style={styles.descriptionInput}
						textAlign="right"
					/>

					<Text style={styles.photoLabel}>תמונה לתחנה</Text>
					<ImagePickerBox
						imageUri={image}
						onPress={() => pickImageAndUpload((url) => setImage(url))}
						placeholderText={uploading ? "מעלה תמונה..." : "הוסף תמונה לתחנה"}
						style={styles.imagePickerSpacing}
						loading={uploading}
					/>

					{!!image && (
						<TouchableOpacity onPress={clearImage} style={styles.removeButton}>
							<Text style={styles.removeText}>הסר תמונה</Text>
						</TouchableOpacity>
					)}
				</ScrollView>
			</View>
		</Modal>
	);
}
