import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// הוספנו את getDocs, query, orderBy
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { colors, spacing, common, buttons, forms, tags } from '../../../styles';
import { FormInput } from '../../../components/FormInput';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import { useBackButton } from '../../../hooks/useBackButton';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';

const CATEGORIES = ["אוכל", "אטרקציה", "מלון", "חיי לילה", "קניות"];
const TAGS = ["כשר", "למשפחה", "תקציב", "יוקרה", "טבע", "רומנטי", "נגיש"];
const BUDGETS = ["₪", "₪₪", "₪₪₪", "₪₪₪₪"];

/**
 * Screen for adding a new recommendation.
 * Users can fill in title, description, category, budget, location, and tags.
 * Also supports uploading an image.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function AddRecommendationScreen({ navigation }) {
  // Setup back button with hook
  useBackButton(navigation, { title: "יאלללה להמליץ!" });

  // Existing fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Image picker with upload hook (SOLID-based composition)
  const { imageUri, pickImage, uploadImage } = useImagePickerWithUpload({ storagePath: 'recommendations' });

  // --- Location Management Fields ---
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  
  const [selectedCountry, setSelectedCountry] = useState(null); // Full country object
  const [selectedCity, setSelectedCity] = useState(null);       // Full city object

  // Selection Modal Management
  const [modalVisible, setModalVisible] = useState(false);
  const [selectionType, setSelectionType] = useState(null); // 'COUNTRY' or 'CITY'

  // 1. Fetch countries on mount
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const q = query(collection(db, 'countries'));
        const snapshot = await getDocs(q);
        const countriesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setCountries(countriesList);
      } catch (error) {
        console.error("Error fetching countries:", error);
        Alert.alert("Error", "Could not load countries list");
      }
    };
    fetchCountries();
  }, []);

  // 2. Fetch cities when country selected
  const handleSelectCountry = async (country) => {
    setSelectedCountry(country);
    setSelectedCity(null); // Reset city
    setModalVisible(false);

    // Fetch cities for selected country
    try {
      const citiesRef = collection(db, 'countries', country.id, 'cities');
      const snapshot = await getDocs(citiesRef);
      const citiesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCities(citiesList);
    } catch (error) {
      console.error("Error fetching cities:", error);
    }
  };

  const handleSelectCity = (city) => {
    setSelectedCity(city);
    setModalVisible(false);
  };

  const openSelectionModal = (type) => {
    if (type === 'CITY' && !selectedCountry) {
      Alert.alert("Hold on", "Please select a country first.");
      return;
    }
    setSelectionType(type);
    setModalVisible(true);
  };

  // --- Helper Functions (Tags, etc) ---

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) setSelectedTags(selectedTags.filter(t => t !== tag));
    else setSelectedTags([...selectedTags, tag]);
  };

  const handleSubmit = async () => {
    // Validating all fields including location
    if (!title || !description || !category || !selectedCountry || !selectedCity) {
      Alert.alert("חסר מידע!", "אנא מלא כותרת, תיאור, קטגוריה ומיקום (מדינה ועיר).");
      return;
    }

    setSubmitting(true);

    try {
      let imageUrl = null;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri);
      }

      // Save document with new structure
      await addDoc(collection(db, 'recommendations'), {
        userId: auth.currentUser?.uid || 'anonymous',
        title,
        description,
        
        // --- Location Data ---
        location: selectedCity.name || selectedCity.id, // Display city name
        country: selectedCountry.id,      // Display country name
        countryId: selectedCountry.id,    // Country ID for filtering
        cityId: selectedCity.id,          // City ID for filtering
        
        category,
        tags: selectedTags,
        budget,
        images: imageUrl ? [imageUrl] : [],
        createdAt: serverTimestamp(),
        likes: 0,
        likedBy: []
      });

      Alert.alert("ההמלצה נוספה בהצלחה!");
      navigation.goBack();
    } catch (error) {
      console.error("Error adding document: ", error);
      Alert.alert("שגיאה", "ההמלצה לא נשמרה.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={common.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Image Picker */}
        <ImagePickerBox
          imageUri={imageUri}
          onPress={pickImage}
          placeholderText="הוסף תמונה"
          style={{ marginBottom: spacing.xl }}
        />

        {/* Title */}
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


        {/* --- Location Selection --- */}
        <View style={styles.rowGroup}>
            {/* City Selector */}
            <View style={{flex: 1, marginRight: 10}}>
                 <Text style={[forms.label, {textAlign: "right"}]}>עיר</Text>
                <TouchableOpacity 
                    style={[styles.selectorButton, !selectedCountry && styles.disabledButton]} 
                    onPress={() => openSelectionModal('CITY')}
                    disabled={!selectedCountry}
                >
                    <Text style={selectedCity ? styles.selectorText : styles.placeholderText}>
                        {selectedCity ? (selectedCity.name || selectedCity.id) : "בחר עיר"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </TouchableOpacity>             
            </View>

                        {/* Country Selector */}
            <View style={{flex: 1}}>
                 <Text style={[forms.label, {textAlign: "right"}]}>מדינה</Text>
                <TouchableOpacity 
                    style={styles.selectorButton} 
                    onPress={() => openSelectionModal('COUNTRY')}
                >
                    <Text style={selectedCountry ? styles.selectorText : styles.placeholderText}>
                        {selectedCountry ? (selectedCountry.name || selectedCountry.id) : "בחר מדינה"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>
        </View>

        {/* Description */}
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

        {/* Category */}
        <View style={forms.inputWrapper}>
          <Text style={[forms.label, {textAlign: "right"}]}>קטגוריה</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[tags.chip, category === cat && tags.chipSelected]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[tags.chipText, category === cat && tags.chipTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Budget */}
        <View style={forms.inputWrapper}>
          <Text style={[forms.label, {textAlign: "right"}]}>תקציב</Text>
          <View style={styles.budgetContainer}>
            {BUDGETS.map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.budgetButton, budget === b && styles.budgetButtonSelected]}
                onPress={() => setBudget(b)}
              >
                <Text style={[styles.budgetText, budget === b && styles.budgetTextSelected]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tags */}
        <View style={forms.inputWrapper}>
          <Text style={[forms.label, {textAlign: "right"}]}>תגיות</Text>
          <View style={tags.container}>
            {TAGS.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[tags.item, selectedTags.includes(tag) && tags.itemSelected]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[tags.text, selectedTags.includes(tag) && tags.textSelected]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[buttons.submit, submitting && buttons.disabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={buttons.submitText}>פרסם המלצה</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* --- המודל (החלון הקופץ) לבחירה --- */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={common.modalOverlay}>
            <View style={[common.modalContent, { maxHeight: '70%', padding: spacing.xl }]}>
                <View style={common.modalHeader}>
                    <Text style={common.modalTitle}>
                        בחר {selectionType === 'COUNTRY' ? 'מדינה' : 'עיר'}
                    </Text>
                    <TouchableOpacity onPress={() => setModalVisible(false)}>
                        <Ionicons name="close" size={24} color="#333" />
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={selectionType === 'COUNTRY' ? countries : cities}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.modalItem}
                            onPress={() => selectionType === 'COUNTRY' ? handleSelectCountry(item) : handleSelectCity(item)}
                        >
                            <Text style={styles.modalItemText}>{item.name || item.id}</Text>
                            {/* סימון של ה-V אם זה נבחר כבר */}
                            {((selectionType === 'COUNTRY' && selectedCountry?.id === item.id) ||
                              (selectionType === 'CITY' && selectedCity?.id === item.id)) && (
                                <Ionicons name="checkmark" size={20} color="#2EC4B6" />
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <Text style={styles.emptyListText}>
                            {selectionType === 'CITY' ? "No cities found for this country." : "Loading..."}
                        </Text>
                    }
                />
            </View>
        </View>
      </Modal>

    </View>
  );
}

// Screen-specific styles only
const styles = StyleSheet.create({
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
  
  // Row group
  rowGroup: { flexDirection: 'row', marginBottom: spacing.xl, justifyContent: 'space-between' },
  
  // Selector
  selectorButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 12, height: 50
  },
  disabledButton: { opacity: 0.5, backgroundColor: colors.borderLight },
  selectorText: { fontSize: 16, color: colors.textPrimary },
  placeholderText: { fontSize: 16, color: colors.placeholder },

  // Modal item
  modalItem: {
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    flexDirection: 'row', justifyContent: 'space-between'
  },
  modalItemText: { fontSize: 16, color: colors.textPrimary },
  emptyListText: { textAlign: 'center', marginTop: 20, color: colors.textMuted },

  // Chip scroll
  chipScroll: { flexDirection: 'row' },

  // Budget
  budgetContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetButton: {
    flex: 1, paddingVertical: 10, backgroundColor: colors.borderLight, alignItems: 'center',
    marginHorizontal: 5, borderRadius: 8,
  },
  budgetButtonSelected: { backgroundColor: colors.primary },
  budgetText: { color: colors.textSecondary, fontWeight: 'bold' },
  budgetTextSelected: { color: colors.white },
});