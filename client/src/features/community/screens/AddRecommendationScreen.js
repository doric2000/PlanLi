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
import SelectionModal from '../components/SelectionModal';

// --- Custom Hooks ---
import { useBackButton } from '../../../hooks/useBackButton';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { getOrCreateDestinationForPlace, searchPlaces } from '../../../services/LocationService';

// --- Constants ---
import { PARENT_CATEGORIES, TAGS_BY_CATEGORY, PRICE_TAGS } from '../../../constants/Constants';
import { getBudgetTheme } from '../../../utils/getBudgetTheme';
import { getUserTier } from '../../../utils/userTier';



// --- Local Helper Component ---
const LabeledInput = ({ label, style, ...props }) => (
  <View style={[{ marginBottom: 16 }, style]}>
    <Text style={{ textAlign: 'right', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
      {label}
    </Text>
    <FormInput textAlign="right" {...props} />
  </View>
);

// function to get category label from ID
const getCategoryLabel = (categoryId) => {
  const categoryObj = PARENT_CATEGORIES.find(c => c.id === categoryId);
  return categoryObj ? categoryObj.label : categoryId;
};

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
  const [locationResolveError, setLocationResolveError] = useState(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);

  // Manual country override (for places missing a country in Google details)
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countriesForPicker, setCountriesForPicker] = useState([]);
  const [loadingCountriesForPicker, setLoadingCountriesForPicker] = useState(false);
  const [pendingCountryOverridePlaceId, setPendingCountryOverridePlaceId] = useState(null);
  const [suggestedCountryForOverride, setSuggestedCountryForOverride] = useState(null);

  const [allCitiesForSearch, setAllCitiesForSearch] = useState([]);
  const [hasLoadedAllCitiesForSearch, setHasLoadedAllCitiesForSearch] = useState(false);
  const isFetchingAllCitiesForSearchRef = useRef(false);
  const allCitiesFetchDebounceRef = useRef(null);

  // --- Image Handling ---
  const { pickImages, uploadImages } = useImagePickerWithUpload({
    storagePath: 'recommendations',
    // Instagram-like feed format: square 1:1 at 1080x1080
    aspect: [1, 1],
    allowsEditing: true,
    quality: 0.9,
    normalizeToAspect: true,
    normalizeAspect: [1, 1],
    normalizeWidth: 1080,
    normalizeHeight: 1080,
    normalizeCompress: 0.9,
  });
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

    const resolvedCategoryId = (() => {
      const fromId = typeof editItem.categoryId === 'string' ? editItem.categoryId.trim() : '';
      if (fromId) return fromId;

      const raw = typeof editItem.category === 'string' ? editItem.category.trim() : '';
      if (!raw) return '';

      // Backward-compat: older docs may have stored the Hebrew label in `category`.
      const byId = PARENT_CATEGORIES.find((c) => c.id === raw);
      if (byId) return byId.id;
      const byLabel = PARENT_CATEGORIES.find((c) => c.label === raw);
      return byLabel?.id || '';
    })();

    const resolvedTags = Array.isArray(editItem.tags)
      ? editItem.tags
          .map((t) => (typeof t === 'string' ? t.trim() : String(t).trim()))
          .filter(Boolean)
      : [];

    setCategory(resolvedCategoryId);
    setSelectedTags(resolvedTags);
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
    setLocationResolveError(null);
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
    setResolvingLocation(true);
    setLocationResolveError(null);
    try {
      const result = await getOrCreateDestinationForPlace(placeId);
      setSelectedCountry(result.destination.country);
      setSelectedCity(result.destination.city);
      setSelectedPlace(result.place);
    } catch (error) {
      // Avoid LogBox/RedBox noise for expected, user-handled flows.
      if (error?.code !== 'MISSING_COUNTRY' && error?.code !== 'DISPUTED_COUNTRY') {
        console.error(error);
      }
      if ((error?.code === 'MISSING_COUNTRY' || error?.code === 'DISPUTED_COUNTRY') && error?.parsed) {
        // Keep place + city (when available), and ask user to pick a country manually.
        const parsed = error.parsed;
        setPendingCountryOverridePlaceId(placeId);
        setSuggestedCountryForOverride(error?.suggestedCountry || null);
        setSelectedCountry(null);
        setSelectedCity(parsed?.cityName ? { id: parsed.cityName, name: parsed.cityName } : null);
        setSelectedPlace({
          placeId: parsed.placeId,
          name: parsed.name,
          address: parsed.address,
          url: parsed.url,
          ...(parsed.coordinates ? { coordinates: parsed.coordinates } : {}),
        });

        setLocationResolveError(
          error?.code === 'DISPUTED_COUNTRY'
            ? 'המדינה שזוהתה אוטומטית שנויה במחלוקת/לא חד-משמעית.'
            : 'חסרה מדינה עבור המיקום שנבחר.'
        );
        Alert.alert(
          'צריך לבחור מדינה',
          error?.code === 'DISPUTED_COUNTRY'
            ? 'המערכת זיהתה מדינה אוטומטית שעשויה להיות לא מדויקת. בחר מדינה ידנית כדי להמשיך.'
            : 'למיקום הזה אין מדינה בנתוני המפה. בחר מדינה ידנית כדי להמשיך.',
          [
            { text: 'ביטול', style: 'cancel' },
            ...(error?.code === 'DISPUTED_COUNTRY' && error?.suggestedCountry?.name
              ? [
                  {
                    text: `השתמש ב-${error.suggestedCountry.name}`,
                    onPress: () => {
                      handleSelectManualCountry({
                        id: error.suggestedCountry.name,
                        name: error.suggestedCountry.name,
                        code: error.suggestedCountry.code || null,
                      });
                    },
                  },
                ]
              : []),
            {
              text: 'בחר מדינה',
              onPress: () => setCountryPickerVisible(true),
            },
          ]
        );
      } else {
        // Clear any stale location so the user can't accidentally save with an old city/country.
        setSelectedCountry(null);
        setSelectedCity(null);
        setSelectedPlace(null);

        const message = error?.message || 'לא הצלחנו לטעון את פרטי המיקום.';
        setLocationResolveError(message);
        Alert.alert('אוי לא!', 'לא הצלחנו לשמור את המיקום שבחרת. נסה לבחור מיקום אחר (למשל העיר עצמה) ולשמור שוב.');
      }
    }
    finally {
      setResolvingLocation(false);
    }
  };

  const loadCountriesForPicker = async () => {
    if (loadingCountriesForPicker) return;
    if (countriesForPicker.length > 0) return;

    setLoadingCountriesForPicker(true);
    try {
      const snap = await getDocs(collection(db, 'countries'));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .map((c) => ({
          id: c.id,
          name: c.name || c.id,
          code: c.code || null,
        }))
        .filter((c) => c.id);

      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));
      setCountriesForPicker(list);
    } catch (e) {
      console.error('Failed to load countries for picker:', e);
      Alert.alert('שגיאה', 'לא הצלחנו לטעון את רשימת המדינות.');
    } finally {
      setLoadingCountriesForPicker(false);
    }
  };

  useEffect(() => {
    if (countryPickerVisible) {
      loadCountriesForPicker();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryPickerVisible]);

  const handleSelectManualCountry = async (country) => {
    const placeId = pendingCountryOverridePlaceId || selectedPlace?.placeId;
    if (!placeId) {
      setCountryPickerVisible(false);
      return;
    }

    setCountryPickerVisible(false);
    setResolvingLocation(true);
    setLocationResolveError(null);

    try {
      const result = await getOrCreateDestinationForPlace(placeId, {
        countryOverride: { name: country?.name || country?.id, code: country?.code || null },
      });
      setSelectedCountry(result.destination.country);
      setSelectedCity(result.destination.city);
      setSelectedPlace(result.place);
      setPendingCountryOverridePlaceId(null);
      setSuggestedCountryForOverride(null);
    } catch (e) {
      // This is still user-visible via Alert; keep console clean unless needed.
      console.error(e);
      setSelectedCountry(null);
      setLocationResolveError(e?.message || 'לא הצלחנו לשמור את המדינה שנבחרה.');
      Alert.alert('שגיאה', 'לא הצלחנו לשמור את המדינה שנבחרה. נסה לבחור מדינה אחרת.');
    } finally {
      setResolvingLocation(false);
    }
  };

const handleSubmit = async () => {
    const tier = getUserTier(auth.currentUser);
    if (tier === 'guest') {
      Alert.alert('יש להתחבר', 'כדי ליצור/לערוך המלצה צריך להתחבר.');
      navigation.navigate('Login');
      return;
    }
    if (tier === 'unverified') {
      Alert.alert('נדרש אימות', 'כדי ליצור/לערוך המלצה צריך לאמת את האימייל.');
      navigation.navigate('VerifyEmail');
      return;
    }

    if (locationResolveError) {
      Alert.alert('שגיאה במיקום', 'אי אפשר לשמור את ההמלצה כל עוד יש שגיאה בבחירת המיקום.');
      return;
    }

    if (resolvingLocation) {
      Alert.alert('רק רגע', 'אנחנו עדיין טוענים את פרטי המיקום שבחרת.');
      return;
    }

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


      // Prepare Data Object for Firestore
      const postData = {
        title,
        description,
        location: selectedCity.name || selectedCity.id,
        country: selectedCountry.name || selectedCountry.id,
        countryId: selectedCountry.id,
        cityId: selectedCity.id,
        category: getCategoryLabel(category),
        categoryId: category,
        tags: selectedTags,
        budget,
        images: finalImages,
        place: selectedPlace || null,
      };

      // Save to Firestore logic
      if (!isEdit) {
        await addDoc(collection(db, 'recommendations'), {
          ...postData,
          userId: auth.currentUser.uid,
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
          placeholderText="הוסף תמונות מהמכשיר שלך (עד 5)"
          imageFit="cover"
          style={{ marginBottom: spacing.xl }}
          testID="add-rec-image-picker"
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
              <TouchableOpacity
                onPress={handleAddImages}
                style={styles.addMoreBtn}
                testID="add-rec-images-add-more"
              >
                <Text style={styles.addMoreText}>הוסף עוד</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* 2. Title Input */}
        <LabeledInput
          label="כותרת"
          placeholder="למשל: 'המסעדה האיטלקית הכי טובה בעיר!'"
          value={title}
          onChangeText={setTitle}
          testID="add-rec-title-input"
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
              setLocationResolveError(null);
              setPendingCountryOverridePlaceId(null);
              setSuggestedCountryForOverride(null);
              // Don't clear selected destination immediately; user may be editing text.
            }}
            localResults={localAutocompleteResults}
            localResultsLoading={localResultsLoading}
            onSelectLocal={handleSelectLocalCity}
            onSelect={handleSelectGooglePlace}
            googleFallbackDelayMs={2000}
            googleSearchFn={(text, opts) => searchPlaces(text, { ...opts, types: 'all' })}
            placeholder="חפש מקום / אטרקציה / מסעדה..."
            inputTestID="add-rec-location-input"
          />

          {!!(locationResolveError && (pendingCountryOverridePlaceId || selectedPlace?.placeId) && !selectedCountry?.id) && (
            <TouchableOpacity
              onPress={() => setCountryPickerVisible(true)}
              activeOpacity={0.85}
              style={{ alignSelf: 'flex-end', marginTop: 8 }}
            >
              <Text style={{ color: colors.primary, fontWeight: 'bold' }}>
                בחר מדינה ידנית
              </Text>
            </TouchableOpacity>
          )}

          {!!(selectedPlace?.placeId && selectedCountry?.id) && (
            <TouchableOpacity
              onPress={() => {
                setPendingCountryOverridePlaceId(selectedPlace.placeId);
                setCountryPickerVisible(true);
              }}
              activeOpacity={0.85}
              style={{ alignSelf: 'flex-end', marginTop: 8 }}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: 'bold' }}>
                שנה מדינה
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 4. Description Input */}
        <LabeledInput
          label="תיאור"
          placeholder="תאר לנו למה אתה ממליץ על המקום הזה..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          testID="add-rec-description-input"
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
          testIDPrefix="add-rec-category"
        />

        {/* 6. Tags Selector - Dynamically filtered based on selected category */}
        {category ? (
          <ChipSelector
            label="תגיות"
            items={TAGS_BY_CATEGORY[category] || []}
            selectedValue={selectedTags}
            onSelect={toggleTag}
            multiSelect={true}
            testIDPrefix="add-rec-tag"
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
          getItemTheme={getBudgetTheme}
          testIDPrefix="add-rec-budget"
        />

        {/* 8. Submit Button */}
        <TouchableOpacity
          style={[buttons.submit, submitting && buttons.disabled]}
          onPress={handleSubmit}
          disabled={submitting || resolvingLocation || !!locationResolveError}
          testID="add-rec-submit"
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

      <SelectionModal
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        title={loadingCountriesForPicker ? 'טוען מדינות...' : 'בחר מדינה'}
        data={countriesForPicker}
        onSelect={handleSelectManualCountry}
        selectedId={selectedCountry?.id}
        emptyText={loadingCountriesForPicker ? 'טוען...' : 'אין מדינות להצגה'}
      />

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
