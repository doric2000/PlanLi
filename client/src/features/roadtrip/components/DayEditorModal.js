import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { FormInput } from '../../../components/FormInput';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import { Ionicons } from '@expo/vector-icons';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { spacing, dayEditorModalStyles as styles } from '../../../styles';

/**
 * Modal for editing day details in a trip.
 * Allows user to add a description and upload an image for a specific day.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Controls visibility of the modal.
 * @param {Function} props.onClose - Callback to close the modal.
 * @param {Function} props.onSave - Callback to save the day's details.
 * @param {Object} props.initialData - Initial data for the day (description, image).
 * @param {number} props.dayIndex - Index of the day being edited.
 */
export default function DayEditorModal({ visible, onClose, onSave, initialData, dayIndex }) {
    const [description, setDescription] = useState('');
    // Image picker with upload hook (SOLID-based composition)
    const { imageUri: image, setImageUri: setImage, pickImageAndUpload, clearImage, uploading } = useImagePickerWithUpload({
        storagePath: 'trips',
    });

    useEffect(() => {
        if (visible) {
            setDescription(initialData?.description || '');
            setImage(initialData?.image || null);
        }
    }, [visible, initialData]);

    const handleSave = () => {
		if (!description){
			Alert.alert("חסר תיאור");
			return;
        }
        if (uploading) {
            Alert.alert("המתן", "התמונה עדיין בהעלאה...");
            return;
        }
        onSave({ description, image }, dayIndex);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="fade" presentationStyle="pageSheet">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} disabled={uploading}>
                        <Text style={styles.headerBtn}>ביטול</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>יום {dayIndex + 1}</Text>
                    <TouchableOpacity onPress={handleSave} disabled={uploading}>
                        <Text style={[styles.headerBtn, { fontWeight: 'bold', opacity: uploading ? 0.5 : 1 }]}>שמור</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.content}>
                    <FormInput
                        label="סיפור היום"
                        placeholder="מה עשית היום? איפה ביקרת?"
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        style={{ height: 150 }}
                        textAlign="right"
                    />

                    <Text style={styles.photoLabel}>תיעוד מהיום</Text>
                    <ImagePickerBox
                        imageUri={image}
                        onPress={() => pickImageAndUpload((url) => {
                            // url is the remote firestore map, setting it directly
                            setImage(url);
                        })}
                        placeholderText={uploading ? "מעלה תמונה..." : "הוסף תמונה"}
                        style={{ marginBottom: spacing.xl }}
                        loading={uploading}
                    />

                    {image && (
                        <TouchableOpacity onPress={clearImage} style={styles.removeBtn}>
                            <Text style={styles.removeText}>הסר תמונה</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        </Modal>
    );
}
