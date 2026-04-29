import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Alert, Image, Modal, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { FormInput } from "../../../components/FormInput";
import { ImagePickerBox } from "../../../components/ImagePickerBox";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal";
import { UNSAVED_LEAVE_MESSAGE, UNSAVED_LEAVE_TITLE } from "../../../constants/unsavedLeaveStrings";
import { useImagePickerWithUpload } from "../../../hooks/useImagePickerWithUpload";
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
			};
		}),
	});
}

export default function DayEditorModal({ visible, onClose, onSave, initialData, dayIndex }) {
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
		pickImageAndUpload,
		clearImage,
		uploading,
	} = useImagePickerWithUpload({
		storagePath: "trips",
	});

	useEffect(() => {
		if (!visible) {
			setDayBaseline(null);
			setUnsavedModalVisible(false);
			pendingDiscardRef.current = null;
			return;
		}
		const desc0 = initialData?.description || "";
		const img0 = initialData?.image || null;
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
		Alert.alert("מחיקת תחנה", `להסיר את תחנה ${index + 1}?`, [
			{ text: "ביטול", style: "cancel" },
			{
				text: "מחק",
				style: "destructive",
				onPress: () => setStops((prev) => prev.filter((_, i) => i !== index)),
			},
		]);
	};

	const handleSave = () => {
		if (!description && stops.length === 0) {
			Alert.alert("חסר תוכן", "הוסף תיאור או לפחות תחנה אחת ליום.");
			return;
		}
		if (uploading) {
			Alert.alert("המתן", "התמונה עדיין בהעלאה...");
			return;
		}
		onSave({ description, image, stops }, dayIndex);
		setUnsavedModalVisible(false);
		pendingDiscardRef.current = null;
		onClose();
	};

	return (
		<Modal visible={visible} animationType="fade" presentationStyle="pageSheet" onRequestClose={tryClose}>
			<SafeAreaView style={styles.container}>
				<UnsavedChangesModal
					visible={unsavedModalVisible}
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
						<Text style={styles.headerBtn}>ביטול</Text>
					</TouchableOpacity>
					<Text style={styles.headerTitle}>יום {dayIndex + 1}</Text>
					<TouchableOpacity onPress={handleSave} disabled={uploading}>
						<Text style={[styles.headerBtn, styles.headerBtnStrong, uploading && styles.headerBtnDisabled]}>
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
						label="סיפור היום"
						placeholder="מה עשית היום? איפה ביקרת?"
						value={description}
						onChangeText={setDescription}
						multiline
						style={styles.descriptionInput}
						textAlign="right"
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
								<Text style={styles.addStopText}>+ הוסף תחנה</Text>
							</TouchableOpacity>
							<Text style={styles.stopsTitle}>תחנות ביום הזה</Text>
						</View>

						{stops.length === 0 ? (
							<Text style={styles.emptyStopsText}>
								עדיין אין תחנות. הוסף נקודות עצירה עם מיקום מדויק.
							</Text>
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
									{stop.image ? (
										<Image source={{ uri: stop.image }} style={styles.stopThumb} />
									) : (
										<View style={styles.stopNumberBadge}>
											<Text style={styles.stopNumberText}>{index + 1}</Text>
										</View>
									)}
									<View style={styles.stopTextWrap}>
										<Text style={styles.stopTitle} numberOfLines={1}>
											{stop.title}
										</Text>
										<Text style={styles.stopMeta} numberOfLines={1}>
											{stop.location || stop.place?.name || stop.place?.address}
										</Text>
									</View>
									<TouchableOpacity
										onPress={(event) => {
											event.stopPropagation?.();
											handleDeleteStop(index);
										}}
										style={styles.deleteStopButton}
									>
										<Text style={styles.deleteStopText}>מחק</Text>
									</TouchableOpacity>
								</TouchableOpacity>
							))
						)}
					</View>

					<Text style={styles.photoLabel}>תיעוד מהיום</Text>
					<ImagePickerBox
						imageUri={image}
						onPress={() => pickImageAndUpload((url) => setImage(url))}
						placeholderText={uploading ? "מעלה תמונה..." : "הוסף תמונה"}
						style={styles.imagePickerSpacing}
						loading={uploading}
					/>

					{!!image && (
						<TouchableOpacity onPress={clearImage} style={styles.removeBtn}>
							<Text style={styles.removeText}>הסר תמונה</Text>
						</TouchableOpacity>
					)}
				</ScrollView>

				<StopEditorModal
					visible={stopModalVisible}
					onClose={() => setStopModalVisible(false)}
					onSave={handleSaveStop}
					initialData={editingStopIndex !== null ? stops[editingStopIndex] : null}
					dayIndex={dayIndex}
					stopIndex={editingStopIndex !== null ? editingStopIndex : stops.length}
				/>
			</SafeAreaView>
		</Modal>
	);
}
