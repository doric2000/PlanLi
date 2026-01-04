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

// --- Constants ---
import { PARENT_CATEGORIES, TAGS_BY_CATEGORY, PRICE_TAGS } from '../../../constants/Constants';



// --- Local Helper Component ---
const LabeledInput = ({ label, style, ...props }) => (
  <View style={[{ marginBottom: 16 }, style]}>
    <Text style={{ textAlign: 'right', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
      {label}
    </Text>
    <FormInput textAlign="right" {...props} />
  </View>
);

export default function AddRecommendationScreen({ navigation , route }) {
  // --- Initialization & Params ---
  const isEdit = route?.params?.mode === 'edit';
  const editItem = route?.params?.item || null;
  const editPostId = route?.params?.postId || null;

  useBackButton(navigation, { title: isEdit ? "עריכת המלצה" : "יאלללה להמליץ!" });

  // --- Local State ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(''); // Stores the ID (e.g., 'food')
  const [selectedTags, setSelectedTags] = useState([]);
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- Image Handling ---
  const { pickImages, uploadImages } = useImagePickerWithUpload({ storagePath: 'recommendations' });
  const existingImages = isEdit ? (editItem?.images || []) : [];
  const [localImageUris, setLocalImageUris] = useState([]);
  const displayImageUris = localImageUris.length ? localImageUris : existingImages;

  // --- Location Handling ---
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
  useEffect(() => {
    if (!isEdit || !editItem) return;

    setTitle(editItem.title || '');
    setDescription(editItem.description || '');
    setCategory(editItem.category || '');
    setSelectedTags(editItem.tags || []);
    setBudget(editItem.budget || '');
  }, [isEdit, editItem]);

  // --- Handlers ---

  // Custom handler for category change to reset sub-tags
  const handleCategoryChange = (newCatId) => {
    setCategory(newCatId);
    setSelectedTags([]); 
  };

  const openSelectionModal = (type) => {
    if (type === 'CITY' && !selectedCountry) {
      Alert.alert("אוי לא!", "אנא בחר מדינה לפני בחירת עיר.");
      return;
    }
    setSelectionType(type);
    setModalVisible(true);
  };

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
    // Basic form validation
    if (!title || !description || !category || !selectedCountry || !selectedCity) {
      Alert.alert("אוי לא!", "אנא מלא את כל השדות הנדרשים (כולל מיקום).");
      return;
    }

    setSubmitting(true);

    try {
      let finalImages = isEdit ? (editItem?.images || []) : [];
      if (localImageUris.length) {
        const uploaded = await uploadImages(localImageUris.slice(0, 5));
        finalImages = uploaded;
      }

      // NEW: Find the label corresponding to the selected ID
      const categoryLabel = PARENT_CATEGORIES.find(c => c.id === category)?.label || category;

      // Prepare Data Object for Firestore
      const postData = {
        title,
        description,
        location: selectedCity.name || selectedCity.id,
        country: selectedCountry.id,
        countryId: selectedCountry.id,
        cityId: selectedCity.id,
        category: categoryLabel, // Now saving the Hebrew Label instead of the ID
        categoryId: category,    // Optional: Keeping the ID as a separate field for easier filtering later
        tags: selectedTags,
        budget,
        images: finalImages,
      };

      // Save to Firestore logic
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
          imageUris={displayImageUris}
          onPress={async () => {
            const uris = await pickImages({ limit: 5 });
            if (uris?.length) setLocalImageUris(uris.slice(0, 5));
          }}
          placeholderText="הוסף תמונות (עד 5)"
          style={{ marginBottom: spacing.xl }}
        />

        {/* 2. Title Input */}
        <LabeledInput
          label="כותרת"
          placeholder="לדוגמא: מסעדת שף בתל אביב"
          value={title}
          onChangeText={setTitle}
        />

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
        <LabeledInput
          label="תיאור"
          placeholder="תאר לנו למה אתה ממליץ על המקום הזה..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        {/* 5. Category Selector - Displays Hebrew Labels but logic uses IDs */}
        <ChipSelector
          label="קטגוריה"
          items={PARENT_CATEGORIES.map(c => c.label)} 
          selectedValue={PARENT_CATEGORIES.find(c => c.id === category)?.label || ''}
          onSelect={(selectedLabel) => {
            const selectedId = PARENT_CATEGORIES.find(c => c.label === selectedLabel)?.id;
            handleCategoryChange(selectedId);
          }} 
          multiSelect={false}
        />

        {/* 6. Tags Selector - Dynamically filtered based on selected category */}
        {category ? (
          <ChipSelector
            label="תגיות"
            items={TAGS_BY_CATEGORY[category]}
            selectedValue={selectedTags}
            onSelect={toggleTag}
            multiSelect={true}
          />
        ) : (
              <Text style={{ textAlign: 'center', fontSize: 14, marginBottom: 8 }}>
               בחר קטגוריה כדי לראות תגיות
              </Text>
        )}

        {/* 7. Budget Selector */}
        <SegmentedControl
          label="תקציב"
          items={PRICE_TAGS}
          selectedValue={budget}
          onSelect={setBudget}
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