import React, { useState, useEffect } from 'react';
import { 
    Modal, 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    StyleSheet, 
    Image, 
    SafeAreaView,
    Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export default function DayEditorModal({ visible, onClose, onSave, initialData, dayIndex }) {
    const [description, setDescription] = useState('');
    const [image, setImage] = useState(null);

    useEffect(() => {
        if (visible) {
            setDescription(initialData?.description || '');
            setImage(initialData?.image || null);
        }
    }, [visible, initialData]);

    const pickImage = async () => {
        // No permissions request is necessary for launching the image library
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const handleSave = () => {
		if (!description){
			Alert.alert("Missing Description");
			return;
		}
        onSave({ description, image }, dayIndex);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={styles.headerBtn}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Day {dayIndex + 1}</Text>
                    <TouchableOpacity onPress={handleSave}>
                        <Text style={[styles.headerBtn, { fontWeight: 'bold' }]}>Save</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.content}>
                    <Text style={styles.label}>Story of the day</Text>
                    <TextInput
                        style={styles.input}
                        multiline
                        placeholder="What did you do today? Where did you go?"
                        value={description}
                        onChangeText={setDescription}
                        textAlignVertical="top"
                    />

                    <Text style={styles.label}>Photo Memory</Text>
                    <TouchableOpacity style={styles.imageUpload} onPress={pickImage}>
                        {image ? (
                            <Image source={{ uri: image }} style={styles.uploadedImage} />
                        ) : (
                            <View style={styles.placeholder}>
                                <Text style={styles.placeholderIcon}>📷</Text>
                                <Text style={styles.placeholderText}>Tap to upload photo</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                    
                    {image && (
                        <TouchableOpacity onPress={() => setImage(null)} style={styles.removeBtn}>
                            <Text style={styles.removeText}>Remove Photo</Text>
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    headerBtn: { fontSize: 16, color: '#007AFF' },
    content: { padding: 20 },
    label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#334155' },
    input: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        padding: 12,
        height: 150,
        fontSize: 16,
        marginBottom: 24,
    },
    imageUpload: {
        height: 200,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    uploadedImage: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center' },
    placeholderIcon: { fontSize: 32, marginBottom: 8 },
    placeholderText: { color: '#64748B' },
    removeBtn: { marginTop: 10, alignItems: 'center' },
    removeText: { color: '#EF4444' }
});