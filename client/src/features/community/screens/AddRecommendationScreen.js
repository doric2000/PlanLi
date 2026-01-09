import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
  Pressable,
  Platform,
} from 'react-native';
// Firestore imports
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, collectionGroup } from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { colors, spacing, common, buttons, forms, tags } from '../../../styles';

// --- Custom Components ---
import { FormInput } from '../../../components/FormInput';
import { ImagePickerBox } from '../../../components/ImagePickerBox';
import GooglePlacesInput from '../../../components/GooglePlacesInput';
import ChipSelector from '../components/ChipSelector';
import SegmentedControl from '../components/SegmentedControl';

// --- Custom Hooks ---
import { useBackButton } from '../../../hooks/useBackButton';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { getOrCreateDestinationForPlace, searchPlaces } from '../../../services/LocationService';

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

  // --- Exact Location Handling (local-first) ---
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null); // {id,name}
  const [selectedCity, setSelectedCity] = useState(null); // {id,name}
  const [selectedPlace, setSelectedPlace] = useState(null); // {placeId,name,address,coordinates,url}

  const [allCitiesForSearch, setAllCitiesForSearch] = useState([]);
  const [hasLoadedAllCitiesForSearch, setHasLoadedAllCitiesForSearch] = useState(false);
  const isFetchingAllCitiesForSearchRef = useRef(false);
  const allCitiesFetchDebounceRef = useRef(null);

  // --- Image Handling ---
  const { pickImages, uploadImages } = useImagePickerWithUpload({ storagePath: 'recommendations' });
  const existingImages = isEdit ? (editItem?.images || []) : [];
  const [editableImageUris, setEditableImageUris] = useState([]);

  useEffect(() => {
    if (isEdit) {
      setEditableImageUris(Array.isArray(existingImages) ? existingImages : []);
    } else {
      setEditableImageUris([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editItem?.id]);

  const handleAddImages = async () => {
    const uris = await pickImages({ limit: 5 });
    if (!uris?.length) return;

    setEditableImageUris((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      for (const uri of uris) {
        if (next.length >= 5) break;
        if (!next.includes(uri)) next.push(uri);
      }
      return next;
    });
  };

  const removeImageAt = (index) => {
    setEditableImageUris((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.splice(index, 1);
      return next;
    });
  };

  // --- Effects ---
  useEffect(() => {
    if (!isEdit || !editItem) return;

    setTitle(editItem.title || '');
    setDescription(editItem.description || '');
    setCategory(editItem.categoryId || '');
    setSelectedTags(Array.isArray(editItem.tags) ? editItem.tags : []);
    setBudget(editItem.budget || '');

    const initialCountryId = editItem.countryId || null;
    const initialCityId = editItem.cityId || null;
    setSelectedCountry(initialCountryId ? { id: initialCountryId, name: editItem.country || initialCountryId } : null);
    setSelectedCity(initialCityId ? { id: initialCityId, name: editItem.location || initialCityId } : null);
    setSelectedPlace(editItem.place || null);
    setLocationQuery(editItem.place?.name || editItem.location || '');
  }, [isEdit, editItem]);

  useEffect(() => {
    const q = locationQuery.trim();
    if (q.length < 2) return;
    if (hasLoadedAllCitiesForSearch) return;
    if (isFetchingAllCitiesForSearchRef.current) return;

    if (allCitiesFetchDebounceRef.current) {
      clearTimeout(allCitiesFetchDebounceRef.current);
    }

    allCitiesFetchDebounceRef.current = setTimeout(async () => {
      isFetchingAllCitiesForSearchRef.current = true;
      try {
        const citiesQuery = query(collectionGroup(db, 'cities'));
        const querySnapshot = await getDocs(citiesQuery);
        const citiesList = querySnapshot.docs.map((cityDoc) => {
          const parentCountry = cityDoc.ref.parent.parent;
          const countryId = parentCountry ? parentCountry.id : 'Unknown';
          return {
            id: cityDoc.id,
            countryId,
            ...cityDoc.data(),
          };
        });
        setAllCitiesForSearch(citiesList);
        setHasLoadedAllCitiesForSearch(true);
      } catch (error) {
        console.error('Error fetching all cities for search:', error);
      } finally {
        isFetchingAllCitiesForSearchRef.current = false;
      }
    }, 400);

    return () => {
      if (allCitiesFetchDebounceRef.current) {
        clearTimeout(allCitiesFetchDebounceRef.current);
        allCitiesFetchDebounceRef.current = null;
      }
    };
  }, [locationQuery, hasLoadedAllCitiesForSearch]);

  // --- Handlers ---

  // Custom handler for category change to reset sub-tags
  const handleCategoryChange = (newCatId) => {
    setCategory(newCatId);
    setSelectedTags((prev) => (newCatId !== category ? [] : prev));
  };

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) setSelectedTags(selectedTags.filter(t => t !== tag));
    else setSelectedTags([...selectedTags, tag]);
  };

  const localCitiesSearchable = locationQuery.trim()
    ? (hasLoadedAllCitiesForSearch ? allCitiesForSearch : [])
    : [];

  const localAutocompleteResults = localCitiesSearchable
    .filter((city) => {
      const q = locationQuery.trim().toLowerCase();
      if (!q) return false;
      const name = (city.name || '').toLowerCase();
      const description = (city.description || '').toLowerCase();
      const countryId = (city.countryId || '').toLowerCase();
      return name.includes(q) || description.includes(q) || countryId.includes(q);
    })
    .slice(0, 20);

  const localResultsLoading = locationQuery.trim().length >= 2 && !hasLoadedAllCitiesForSearch;

  const handleSelectLocalCity = (city) => {
    if (!city?.id || !city?.countryId) return;
    setSelectedCountry({ id: city.countryId, name: city.countryId });
    setSelectedCity({ id: city.id, name: city.name || city.id });
    setSelectedPlace(
      city.googlePlaceId
        ? {
            placeId: city.googlePlaceId,
            name: city.name || null,
            address: city.description || null,
            ...(city.coordinates ? { coordinates: city.coordinates } : {}),
          }
        : null
    );
  };

  const handleSelectGooglePlace = async (placeId) => {
    try {
      const result = await getOrCreateDestinationForPlace(placeId);
      setSelectedCountry(result.destination.country);
      setSelectedCity(result.destination.city);
      setSelectedPlace(result.place);
    } catch (error) {
      console.error(error);
      Alert.alert('אוי לא!', 'לא הצלחנו לטעון את פרטי המיקום.');
    }
  };

const handleSubmit = async () => {
    // Basic form validation
    if (!title || !description || !category || !selectedCountry?.id || !selectedCity?.id) {
      Alert.alert("אוי לא!", "אנא מלא את כל השדות הנדרשים (כולל מיקום).");
      return;
    }

    setSubmitting(true);

    try {
      // Build final images list: keep existing remote URLs, upload local URIs.
      const current = Array.isArray(editableImageUris) ? editableImageUris.slice(0, 5) : [];
      const isRemote = (uri) => typeof uri === 'string' && /^https?:\/\//i.test(uri);
      const localUris = current.filter((uri) => !isRemote(uri));

      const uploadedLocal = localUris.length ? await uploadImages(localUris) : [];
      const uploadedQueue = [...uploadedLocal];
      const finalImages = current.map((uri) => (isRemote(uri) ? uri : uploadedQueue.shift())).filter(Boolean);

      // NEW: Find the label corresponding to the selected ID
      const categoryLabel = PARENT_CATEGORIES.find(c => c.id === category)?.label || category;

      // Prepare Data Object for Firestore
      const postData = {
        title,
        description,
        location: selectedCity.name || selectedCity.id,
        country: selectedCountry.name || selectedCountry.id,
        countryId: selectedCountry.id,
        cityId: selectedCity.id,
        category: categoryLabel, // Now saving the Hebrew Label instead of the ID
        categoryId: category,    // Optional: Keeping the ID as a separate field for easier filtering later
        tags: selectedTags,
        budget,
        images: finalImages,
        place: selectedPlace || null,
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
          imageUris={editableImageUris}
          onPress={handleAddImages}
          placeholderText="הוסף תמונות (עד 5)"
          style={{ marginBottom: spacing.xl }}
        />

        {editableImageUris.length > 0 ? (
          <View style={styles.imagesRow}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagesScroll}>
              {editableImageUris.map((uri, index) => (
                <View key={`${uri}:${index}`} style={styles.thumbWrap}>
                  {Platform.OS === 'web' ? (
                    <img
                      src={uri}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        backgroundColor: '#F3F4F6',
                      }}
                    />
                  ) : (
                    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                  )}
                  <Pressable onPress={() => removeImageAt(index)} style={styles.thumbRemove} hitSlop={10}>
                    <Text style={styles.thumbRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            {editableImageUris.length < 5 ? (
              <TouchableOpacity onPress={handleAddImages} style={styles.addMoreBtn}>
                <Text style={styles.addMoreText}>הוסף עוד</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* 2. Title Input */}
        <LabeledInput
          label="כותרת"
          placeholder="לדוגמא: מסעדת שף בתל אביב"
          value={title}
          onChangeText={setTitle}
        />

        {/* 3. Exact Location Selection (local-first) */}
        <View style={{ marginBottom: spacing.xl }}>
          <Text style={{ textAlign: 'right', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
            מיקום מדויק
          </Text>
          <GooglePlacesInput
            mode="google"
            value={locationQuery}
            onChangeValue={(text) => {
              setLocationQuery(text);
              setSelectedPlace(null);
              // Don't clear selected destination immediately; user may be editing text.
            }}
            localResults={localAutocompleteResults}
            localResultsLoading={localResultsLoading}
            onSelectLocal={handleSelectLocalCity}
            onSelect={handleSelectGooglePlace}
            googleFallbackDelayMs={2000}
            googleSearchFn={(text, opts) => searchPlaces(text, { ...opts, types: 'all' })}
            placeholder="חפש מקום / אטרקציה / מסעדה..."
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
            items={TAGS_BY_CATEGORY[category] || []}
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

    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
  imagesRow: {
    marginTop: -spacing.lg,
    marginBottom: spacing.xl,
  },
  imagesScroll: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    marginLeft: spacing.sm,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  addMoreBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
  },
  addMoreText: {
    color: colors.primary,
    fontWeight: '700',
  },
});