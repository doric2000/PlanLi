import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet
} from 'react-native';
// Firestore imports
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { colors, spacing, common, buttons, forms, tags } from '../../../styles';

// --- Custom Components ---
import { FormInput } from '../../../components/FormInput';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import SelectField from '../components/SelectField'; 
import SelectionModal from '../components/SelectionModal';
import ChipSelector from '../components/ChipSelector';
import SegmentedControl from '../components/SegmentedControl';

// --- Custom Hooks ---
import { useBackButton } from '../../../hooks/useBackButton';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { useLocationData } from '../../../hooks/useLocationData'; 

import { CATEGORY_TAGS, PRICE_TAGS } from '../../../constants/Constatns';

const TAGS = ["כשר", "למשפחה", "תקציב", "יוקרה", "טבע", "רומנטי", "נגיש"];

export default function AddRecommendationScreen({ navigation , route }) {
  // --- Initialization & Params ---
  const isEdit = route?.params?.mode === 'edit';
  const editItem = route?.params?.item || null;
  const editPostId = route?.params?.postId || null;

  useBackButton(navigation, { title: isEdit ? "עריכת המלצה" : "יאלללה להמליץ!" });

  // --- Local State ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- Image Handling ---
  const { imageUri, pickImage, uploadImage } = useImagePickerWithUpload({ storagePath: 'recommendations' });
  const existingImage = isEdit ? (editItem?.images?.[0] || null) : null;
  const displayImageUri = imageUri || existingImage;

  // --- Location Handling (via Custom Hook) ---
  const { 
    countries, 
    cities, 
    selectedCountry, 
    selectedCity, 
    handleSelectCountry, 
    handleSelectCity 
  } = useLocationData(
    isEdit ? editItem?.countryId : null, 
    isEdit ? editItem?.cityId : null
  );

  // --- Modal State ---
  const [modalVisible, setModalVisible] = useState(false);
  const [selectionType, setSelectionType] = useState(null); 

  // --- Effects ---
  
  // Pre-fill form data if in Edit Mode
  useEffect(() => {
    if (!isEdit || !editItem) return;

    setTitle(editItem.title || '');
    setDescription(editItem.description || '');
    setCategory(editItem.category || '');
    setSelectedTags(editItem.tags || []);
    setBudget(editItem.budget || '');
  }, [isEdit, editItem]);

  // --- Handlers ---

  const openSelectionModal = (type) => {
    // Validate country selection before opening city modal
    if (type === 'CITY' && !selectedCountry) {
      Alert.alert("אוי לא!", "אנא בחר מדינה לפני בחירת עיר.");
      return;
    }
    setSelectionType(type);
    setModalVisible(true);
  };

  // Wrapper handlers to close modal after selection
  const onCountrySelect = (item) => {
    handleSelectCountry(item);
    setModalVisible(false);
  };

  const onCitySelect = (item) => {
    handleSelectCity(item);
    setModalVisible(false);
  };

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) setSelectedTags(selectedTags.filter(t => t !== tag));
    else setSelectedTags([...selectedTags, tag]);
  };

  const handleSubmit = async () => {
    // Form Validation (Your custom alerts)
    if (!title || !description || !category || !selectedCountry || !selectedCity) {
      Alert.alert("אוי לא!", "אנא מלא את כל השדות הנדרשים (כולל מיקום).");
      return;
    }

    setSubmitting(true);

    try {
      let imageUrl = null;

      // Handle Image Upload
      if (imageUri) {
        imageUrl = await uploadImage(imageUri);
      }
      const prevImages = editItem?.images || [];
      const finalImages = imageUrl ? [imageUrl] : (isEdit ? prevImages : []);

      // Prepare Data Object
      const postData = {
        title,
        description,
        location: selectedCity.name || selectedCity.id,
        country: selectedCountry.id,
        countryId: selectedCountry.id,
        cityId: selectedCity.id,
        category,
        tags: selectedTags,
        budget,
        images: finalImages,
      };

      // Save to Firestore
      if (!isEdit) {
        await addDoc(collection(db, 'recommendations'), {
          ...postData,
          userId: auth.currentUser?.uid || 'anonymous',
          createdAt: serverTimestamp(),
          likes: 0,
          likedBy: [],
        });
        Alert.alert("איזה כיף!", "ההמלצה נוספה בהצלחה!");
      } else {
        await updateDoc(doc(db, 'recommendations', editPostId), {
          ...postData,
          updatedAt: serverTimestamp(),
        });
        Alert.alert("איזה כיף!", "ההמלצה עודכנה בהצלחה!");
      }
      navigation.goBack();

    } catch (error) {
      console.error("Error saving document: ", error);
      Alert.alert("אוי לא!", "לא הצלחנו לשמור את ההמלצה.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ---
  return (
    <View style={common.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* 1. Image Picker */}
        <ImagePickerBox
          imageUri={displayImageUri}
          onPress={pickImage}
          placeholderText="הוסף תמונה"
          style={{ marginBottom: spacing.xl }}
        />

        {/* 2. Title Input */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ textAlign: 'right', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
            כותרת
          </Text>
          <FormInput
            placeholder="לדוגמא: מסעדת שף בתל אביב"
            value={title}
            onChangeText={setTitle}
            textAlign="right"
          />
        </View>

        {/* 3. Location Selection */}
        <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: spacing.xl }}>
            <SelectField 
                label="מדינה"
                placeholder="בחר מדינה"
                value={selectedCountry ? (selectedCountry.name || selectedCountry.id) : null}
                onPress={() => openSelectionModal('COUNTRY')}
            />
            <SelectField 
                label="עיר"
                placeholder="בחר עיר"
                value={selectedCity ? (selectedCity.name || selectedCity.id) : null}
                onPress={() => openSelectionModal('CITY')}
                disabled={!selectedCountry}
            />
        </View>

        {/* 4. Description Input */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ textAlign: 'right', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
            תיאור
          </Text>
          <FormInput
            placeholder="תאר לנו למה אתה ממליץ על המקום הזה..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlign="right"
          />
        </View>

        {/* 5. Category Selector */}
        <ChipSelector
          label="קטגוריה"
          items={CATEGORY_TAGS}
          selectedValue={category}
          onSelect={setCategory} 
          multiSelect={false}
        />

        {/* 6. Budget Selector */}
        <SegmentedControl
          label="תקציב"
          items={PRICE_TAGS}
          selectedValue={budget}
          onSelect={setBudget}
        />

        {/* 7. Tags Selector */}
        <ChipSelector
          label="תגיות"
          items={TAGS}
          selectedValue={selectedTags}
          onSelect={toggleTag}
          multiSelect={true}
        />

        {/* 8. Submit Button */}
        <TouchableOpacity
          style={[buttons.submit, submitting && buttons.disabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={buttons.submitText}>
              {isEdit ? 'שמור שינויים' : 'פרסם המלצה'}
            </Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* --- Selection Modal --- */}
      <SelectionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={selectionType === 'COUNTRY' ? 'בחר מדינה' : 'בחר עיר'}
        data={selectionType === 'COUNTRY' ? countries : cities}
        onSelect={selectionType === 'COUNTRY' ? onCountrySelect : onCitySelect}
        selectedId={selectionType === 'COUNTRY' ? selectedCountry?.id : selectedCity?.id}
        emptyText={selectionType === 'CITY' ? "No cities found for this country" : "Loading..."}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
});