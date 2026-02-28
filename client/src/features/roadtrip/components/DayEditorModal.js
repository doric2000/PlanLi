import React, { useState, useEffect } from 'react';
import { 
    Modal, 
    View, 
    Text, 
    TouchableOpacity, 
    StyleSheet, 
    SafeAreaView,
    Alert
} from 'react-native';
import { FormInput } from '../../../components/FormInput';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import { Ionicons } from '@expo/vector-icons';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { spacing } from '../../../styles';

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
    const { imageUri: image, setImageUri: setImage, pickImage, clearImage } = useImagePickerWithUpload({ 
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
        onSave({ description, image }, dayIndex);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="fade" presentationStyle="pageSheet">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={styles.headerBtn}>ביטול</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>יום {dayIndex + 1}</Text>
                    <TouchableOpacity onPress={handleSave}>
                        <Text style={[styles.headerBtn, { fontWeight: 'bold' }]}>שמור</Text>
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
                                  onPress={pickImage}
                                  placeholderText="הוסף תמונה"
                                  style={{ marginBottom: spacing.xl }}
                        // onPress={pickImage}
                        // placeholderText="Tap to upload photo"
                        // // iconColor="#64748B"
                        // iconSize={32}
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'right' },
    headerBtn: { fontSize: 16, color: '#007AFF' },
    content: { padding: 20 },
    photoLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#334155', textAlign: 'right' },
    removeBtn: { marginTop: 10, alignItems: 'center' },
    removeText: { color: '#EF4444' }
});
