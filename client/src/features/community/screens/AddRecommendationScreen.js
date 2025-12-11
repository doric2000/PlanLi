import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  StyleSheet
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
// הוספנו את getDocs, query, orderBy
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../config/firebase';
import { colors, spacing, common, buttons, forms, tags } from '../../../styles';

const CATEGORIES = ["Food", "Attraction", "Hotel", "Nightlife", "Shopping"];
const TAGS = ["Kosher", "Family", "Budget", "Luxury", "Nature", "Romantic", "Accessible"];
const BUDGETS = ["$", "$$", "$$$", "$$$$"];

/**
 * Screen for adding a new recommendation.
 * Users can fill in title, description, category, budget, location, and tags.
 * Also supports uploading an image.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function AddRecommendationScreen({ navigation }) {
  // Existing fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [budget, setBudget] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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

  // --- Helper Functions (Image, Tags, etc) ---

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission required!");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) setSelectedTags(selectedTags.filter(t => t !== tag));
    else setSelectedTags([...selectedTags, tag]);
  };

  const uploadImage = async (uri) => {
    if (!uri) return null;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `recommendations/${auth.currentUser?.uid}/${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (e) {
      console.error("Upload failed", e);
      throw e;
    }
  };

  const handleSubmit = async () => {
    // Validating all fields including location
    if (!title || !description || !category || !selectedCountry || !selectedCity) {
      Alert.alert("Missing Info", "Please fill in Title, Description, Category, and Location (Country & City).");
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

      Alert.alert("Success", "Recommendation added!");
      navigation.goBack();
    } catch (error) {
      console.error("Error adding document: ", error);
      Alert.alert("Error", "Failed to save recommendation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={common.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Image Picker */}
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="camera" size={40} color="#ccc" />
              <Text style={styles.imagePlaceholderText}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Title */}
        <View style={forms.inputWrapper}>
          <Text style={forms.label}>Title</Text>
          <TextInput
            style={forms.input}
            placeholder="e.g., Best Hummus in Jaffa"
            placeholderTextColor={forms.placeholder}
            value={title}
            onChangeText={setTitle}
            textAlign="right"
          />
        </View>

        {/* --- Location Selection --- */}
        <View style={styles.rowGroup}>
            {/* Country Selector */}
            <View style={{flex: 1, marginRight: 10}}>
                <Text style={forms.label}>Country</Text>
                <TouchableOpacity 
                    style={styles.selectorButton} 
                    onPress={() => openSelectionModal('COUNTRY')}
                >
                    <Text style={selectedCountry ? styles.selectorText : styles.placeholderText}>
                        {selectedCountry ? (selectedCountry.name || selectedCountry.id) : "Select Country"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* City Selector */}
            <View style={{flex: 1}}>
                <Text style={forms.label}>City</Text>
                <TouchableOpacity 
                    style={[styles.selectorButton, !selectedCountry && styles.disabledButton]} 
                    onPress={() => openSelectionModal('CITY')}
                    disabled={!selectedCountry}
                >
                    <Text style={selectedCity ? styles.selectorText : styles.placeholderText}>
                        {selectedCity ? (selectedCity.name || selectedCity.id) : "Select City"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>
        </View>

        {/* Description */}
        <View style={forms.inputWrapper}>
          <Text style={forms.label}>Description</Text>
          <TextInput
            style={[forms.input, forms.inputMultiline]}
            placeholder="Tell us why it's great..."
            placeholderTextColor={forms.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlign="right"
          />
        </View>

        {/* Category */}
        <View style={forms.inputWrapper}>
          <Text style={forms.label}>Category</Text>
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
          <Text style={forms.label}>Budget</Text>
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
          <Text style={forms.label}>Tags</Text>
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
            <Text style={buttons.submitText}>Post Recommendation</Text>
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
                        Select {selectionType === 'COUNTRY' ? 'Country' : 'City'}
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
  
  // Image picker
  imagePicker: {
    width: '100%', height: 200, backgroundColor: colors.borderLight, borderRadius: 15,
    marginBottom: spacing.xl, overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  previewImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center' },
  imagePlaceholderText: { color: colors.textMuted, marginTop: 10 },
  
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