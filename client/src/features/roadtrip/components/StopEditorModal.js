import React, { useEffect, useState } from "react";
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";

import ExactLocationPicker from "../../../components/ExactLocationPicker";
import { FormInput } from "../../../components/FormInput";
import { ImagePickerBox } from "../../../components/ImagePickerBox";
import { useImagePickerWithUpload } from "../../../hooks/useImagePickerWithUpload";
import { hasValidStopLocation } from "../utils/routeStops";
import { stopEditorModalStyles as styles } from "../../../styles";

const createStopId = () => `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
		if (!visible) return;
		setTitle(initialData?.title || "");
		setDescription(initialData?.description || "");
		setImage(initialData?.image || null);
		setLocationValue(initialData || null);
	}, [visible, initialData, setImage]);

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
		onClose?.();
	};

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
			<View style={styles.container}>
				<View style={styles.header}>
					<TouchableOpacity onPress={onClose} disabled={uploading}>
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
