import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
// הוספנו את getDocs, query, orderBy
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../config/firebase';

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
  // שדות קיימים
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [budget, setBudget] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // --- שדות חדשים לניהול מיקום ---
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  
  const [selectedCountry, setSelectedCountry] = useState(null); // האובייקט המלא של המדינה
  const [selectedCity, setSelectedCity] = useState(null);       // האובייקט המלא של העיר

  // ניהול המודל (החלון הקופץ) לבחירה
  const [modalVisible, setModalVisible] = useState(false);
  const [selectionType, setSelectionType] = useState(null); // 'COUNTRY' או 'CITY'

  // 1. שליפת רשימת המדינות בטעינת המסך
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const q = query(collection(db, 'countries')); // אפשר להוסיף orderBy('name')
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

  // 2. פונקציה לשליפת ערים כשבוחרים מדינה
  const handleSelectCountry = async (country) => {
    setSelectedCountry(country);
    setSelectedCity(null); // איפוס העיר אם החלפנו מדינה
    setModalVisible(false);

    // שליפת הערים של המדינה שנבחרה
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

  // --- פונקציות קיימות (תמונה, תגיות וכו') ---

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
    // בדיקת תקינות מעודכנת - בודקים שנבחרו מדינה ועיר
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

      // שמירת המסמך המעודכן עם המבנה החדש
      await addDoc(collection(db, 'recommendations'), {
        userId: auth.currentUser?.uid || 'anonymous',
        title,
        description,
        
        // --- שינוי: שמירת המידע המובנה ---
        location: selectedCity.name || selectedCity.id, // שם העיר לתצוגה פשוטה
        country: selectedCountry.id,      // שם המדינה לתצוגה
        countryId: selectedCountry.id,    // מזהה המדינה לסינון
        cityId: selectedCity.id,          // מזהה העיר לסינון
        
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
    <View style={styles.container}>
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
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Best Hummus in Jaffa"
            value={title}
            onChangeText={setTitle}
            textAlign="right"
          />
        </View>

        {/* --- חלק חדש: בחירת מיקום --- */}
        <View style={styles.rowGroup}>
            {/* כפתור בחירת מדינה */}
            <View style={{flex: 1, marginRight: 10}}>
                <Text style={styles.label}>Country</Text>
                <TouchableOpacity 
                    style={styles.selectorButton} 
                    onPress={() => openSelectionModal('COUNTRY')}
                >
                    <Text style={selectedCountry ? styles.selectorText : styles.placeholderText}>
                        {selectedCountry ? (selectedCountry.name || selectedCountry.id) : "Select Country"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
            </View>

            {/* כפתור בחירת עיר */}
            <View style={{flex: 1}}>
                <Text style={styles.label}>City</Text>
                <TouchableOpacity 
                    style={[styles.selectorButton, !selectedCountry && styles.disabledButton]} 
                    onPress={() => openSelectionModal('CITY')}
                    disabled={!selectedCountry}
                >
                    <Text style={selectedCity ? styles.selectorText : styles.placeholderText}>
                        {selectedCity ? (selectedCity.name || selectedCity.id) : "Select City"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
            </View>
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell us why it's great..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlign="right"
          />
        </View>

        {/* Category */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, category === cat && styles.chipSelected]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Budget */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Budget</Text>
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
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tags</Text>
          <View style={styles.tagContainer}>
            {TAGS.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.tagChip, selectedTags.includes(tag) && styles.tagChipSelected]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagText, selectedTags.includes(tag) && styles.tagTextSelected]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Post Recommendation</Text>
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
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  imagePicker: {
    width: '100%', height: 200, backgroundColor: '#f0f2f5', borderRadius: 15,
    marginBottom: 20, overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed',
  },
  previewImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center' },
  imagePlaceholderText: { color: '#888', marginTop: 10 },
  inputGroup: { marginBottom: 20 },
  rowGroup: { flexDirection: 'row', marginBottom: 20, justifyContent: 'space-between' },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#333', textAlign: 'right' },
  input: {
    backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    padding: 12, fontSize: 16,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  
  // סגנונות חדשים לבוחר (Selector)
  selectorButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    padding: 12, height: 50
  },
  disabledButton: { opacity: 0.5, backgroundColor: '#eee' },
  selectorText: { fontSize: 16, color: '#333' },
  placeholderText: { fontSize: 16, color: '#aaa' },

  // סגנונות למודל
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', padding: 20
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15,
    borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalItem: {
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexDirection: 'row', justifyContent: 'space-between'
  },
  modalItemText: { fontSize: 16 },
  emptyListText: { textAlign: 'center', marginTop: 20, color: '#888' },

  // שאר הסגנונות הקיימים (Chips, Tags וכו')
  chipScroll: { flexDirection: 'row' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f2f5',
    marginRight: 10, borderWidth: 1, borderColor: 'transparent',
  },
  chipSelected: { backgroundColor: '#e6f7f6', borderColor: '#2EC4B6' },
  chipText: { color: '#555' },
  chipTextSelected: { color: '#2EC4B6', fontWeight: 'bold' },
  budgetContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetButton: {
    flex: 1, paddingVertical: 10, backgroundColor: '#f0f2f5', alignItems: 'center',
    marginHorizontal: 5, borderRadius: 8,
  },
  budgetButtonSelected: { backgroundColor: '#2EC4B6' },
  budgetText: { color: '#555', fontWeight: 'bold' },
  budgetTextSelected: { color: '#fff' },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  tagChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#f0f2f5',
    marginRight: 8, marginBottom: 8,
  },
  tagChipSelected: { backgroundColor: '#FF9F1C' },
  tagText: { fontSize: 12, color: '#555' },
  tagTextSelected: { color: '#fff', fontWeight: 'bold' },
  submitButton: {
    backgroundColor: '#1E3A5F', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 10,
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});