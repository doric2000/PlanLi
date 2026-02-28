import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    StyleSheet,
} from "react-native";
import {
    colors,
    common,
    buttons,
    spacing,
} from "../../../styles";
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    serverTimestamp,
} from "firebase/firestore";
import {
    DIFFICULTY_TAGS,
    TRAVEL_STYLE_TAGS,
    ROAD_TRIP_TAGS,
    EXPERIENCE_TAGS,
} from "../../../constants/Constants.js";
import { db, auth } from '../../../config/firebase';
import PlacesInput from '../components/PlacesInput';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import DayEditorModal from '../components/DayEditorModal';
import DayList from '../components/DayList';
import { FormInput } from '../../../components/FormInput';
import { useBackButton } from '../../../hooks/useBackButton';
import { getUserTier } from '../../../utils/userTier';
import ChipSelector from '../../community/components/ChipSelector';

const LabeledInput = ({ label, style, ...props }) => (
    <View style={[{ marginBottom: spacing.lg }, style]}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <FormInput textAlign="right" {...props} />
    </View>
);

/**
 * Screen for adding/editing a route.
 * Aligned with the new dynamic Constants structure.
 */
export default function AddRoutesScreen({ navigation, route }) {
    // Setup back button
    useBackButton(navigation, { title: route?.params?.routeToEdit ? "עריכת מסלול" : "מסלול חדש" });

    // --- State Management ---
    const [title, setTitle] = useState("");
    const [days, setDays] = useState("");
    const [places, setPlaces] = useState([""]);
    const [distance, setDistance] = useState("");
    const [desc, setDesc] = useState("");
    const [tripDays, setTripDays] = useState([]);
    
    // Tag States (Single vs Multi)
    const [difficultyTag, setDifficultyTag] = useState(""); // String
    const [travelStyleTag, setTravelStyleTag] = useState(""); // String
    const [roadTripTags, setRoadTripTags] = useState([]); // Array
    const [experienceTags, setExperienceTags] = useState([]); // Array
    
    const [tags, setTags] = useState([]); // Combined array for Firestore
    const [submitting, setSubmitting] = useState(false);
    const [isDayModalVisible, setDayModalVisible] = useState(false);
    const [editingDayIndex, setEditingDayIndex] = useState(null);

    const { user } = useCurrentUser();
    const routeToEdit = route?.params?.routeToEdit;

    // Helper: Extract label from constant item (handles both String and Object)
    const getLabel = (item) => (typeof item === 'object' ? item.label : item);

    // --- Effects ---
    
    // Load existing data if in Edit Mode
    useEffect(() => {
        if (routeToEdit) {
            setTitle(routeToEdit.Title || "");
            setDays(routeToEdit.days ? routeToEdit.days.toString() : "");
            setPlaces(routeToEdit.places || [""]);
            setDistance(routeToEdit.distance ? routeToEdit.distance.toString() : "");
            setDesc(routeToEdit.desc || "");
            setTripDays(routeToEdit.tripDaysData || []);
            setDifficultyTag(routeToEdit.difficultyTag || "");
            setTravelStyleTag(routeToEdit.travelStyleTag || "");
            setRoadTripTags(routeToEdit.roadTripTags || []);
            setExperienceTags(routeToEdit.experienceTags || []);
        }
    }, [routeToEdit]);

    // Update the combined 'tags' array whenever specific tag states change
    useEffect(() => {
        const combinedTags = [
            difficultyTag,
            travelStyleTag,
            ...roadTripTags,
            ...experienceTags,
        ].filter(Boolean); // Remove empty/null values
        setTags(combinedTags);
    }, [difficultyTag, travelStyleTag, roadTripTags, experienceTags]);

    // --- Handlers ---

    const ensureVerifiedForWrite = () => {
        const tier = getUserTier(auth.currentUser);
        if (tier === 'guest') {
            Alert.alert('יש להתחבר', 'כדי ליצור/לערוך מסלול צריך להתחבר.');
            navigation.navigate('Login');
            return false;
        }
        if (tier === 'unverified') {
            Alert.alert('נדרש אימות', 'כדי ליצור/לערוך מסלול צריך לאמת את האימייל.');
            navigation.navigate('VerifyEmail');
            return false;
        }
        return true;
    };

    const handleSaveDay = (dayData, index) => {
        const newTripDays = [...tripDays];
        if (index >= newTripDays.length) {
            newTripDays.push(dayData);
        } else {
            newTripDays[index] = dayData;
        }
        setTripDays(newTripDays);
        setDays(newTripDays.length.toString());
    };

    const handleDeleteDay = (index) => {
        Alert.alert("מחיקת יום", `להסיר את יום ${index + 1}?`, [
            { text: "ביטול", style: "cancel" },
            {
                text: "מחק",
                style: "destructive",
                onPress: () => {
                    const updated = tripDays.filter((_, i) => i !== index);
                    setTripDays(updated);
                    setDays(updated.length.toString());
                },
            },
        ]);
    };

    const addRoute = async () => {
        if (!ensureVerifiedForWrite()) {
            return;
        }
        if (!user) {
            Alert.alert("שגיאה", "משתמש חייב להיות מחובר!");
            return;
        }
        if (!title || !days || !places.length || !distance || !desc) {
            Alert.alert("שגיאה", "אנא מלא את כל השדות הנדרשים.");
            return;
        }

        setSubmitting(true);

        // Build the payload object
        const routeData = {
            Title: title,
            days: parseInt(days, 10),
            tripDaysData: tripDays,
            places,
            distance: parseFloat(distance),
            tags, // Combined array for global search
            desc,
            difficultyTag,
            travelStyleTag,
            roadTripTags,
            experienceTags,
            userId: user?.uid,
        };

        // --- DEBUG LOG: Verify payload matches backend expectations ---
        console.log("PlanLi Debug - Saving Route:", JSON.stringify(routeData, null, 2));

        try {
            if (routeToEdit) {
                await updateDoc(doc(db, "routes", routeToEdit.id), {
                    ...routeData,
                    updatedAt: serverTimestamp(),
                });
                Alert.alert("הצלחה", "המסלול עודכן!");
            } else {
                await addDoc(collection(db, "routes"), {
                    ...routeData,
                    createdAt: serverTimestamp(),
                });
                Alert.alert("הצלחה", "המסלול נוסף!");
            }
            navigation.goBack();
        } catch (e) {
            console.error("Firestore Error:", e);
            Alert.alert("שגיאה", "לא הצלחנו לשמור את המסלול.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={[common.container, styles.container]}>
            <ScrollView
                keyboardShouldPersistTaps='handled'
                contentContainerStyle={styles.scrollContent}
            >
                <Text style={styles.screenTitle}>{routeToEdit ? "עריכת מסלול" : "מסלול חדש"}</Text>

                <LabeledInput
                    label="כותרת המסלול"
                    placeholder="לדוגמה: מסלול טבע בנורבגיה"
                    value={title}
                    onChangeText={setTitle}
                    testID="route-title-input"
                />

                <LabeledInput
                    label="מספר ימים"
                    placeholder="כמה ימים כוללת התוכנית?"
                    value={days}
                    onChangeText={setDays}
                    keyboardType='numeric'
                    testID="route-days-input"
                />

                <DayList
                    days={tripDays}
                    onAdd={() => { setEditingDayIndex(tripDays.length); setDayModalVisible(true); }}
                    onEdit={(index) => { setEditingDayIndex(index); setDayModalVisible(true); }}
                    onDelete={handleDeleteDay}
                    style={{ marginBottom: spacing.lg }}
                />

                <View style={{ marginBottom: spacing.lg }}>
                    <PlacesInput places={places} setPlaces={setPlaces} />
                </View>

                <LabeledInput
                    label="מרחק (ק״מ)"
                    placeholder="לדוגמה: 120"
                    value={distance}
                    onChangeText={setDistance}
                    keyboardType='numeric'
                    testID="route-distance-input"
                />

                <LabeledInput
                    label="תיאור המסלול"
                    placeholder="תאר בקצרה את המסלול והאווירה"
                    value={desc}
                    onChangeText={setDesc}
                    multiline
                    numberOfLines={4}
                    testID="route-description-input"
                    style={{ marginBottom: spacing.xl }}
                />

                <ChipSelector
                    label="רמת קושי"
                    items={DIFFICULTY_TAGS.map(getLabel)}
                    selectedValue={difficultyTag}
                    onSelect={setDifficultyTag}
                    multiSelect={false}
                    testIDPrefix="route-difficulty"
                />

                <ChipSelector
                    label="סגנון טיול"
                    items={TRAVEL_STYLE_TAGS.map(getLabel)}
                    selectedValue={travelStyleTag}
                    onSelect={setTravelStyleTag}
                    multiSelect={false}
                    testIDPrefix="route-style"
                />

                <ChipSelector
                    label="תגיות רואדטריפ"
                    items={ROAD_TRIP_TAGS.map(getLabel)}
                    selectedValue={roadTripTags}
                    onSelect={(tag) => {
                        setRoadTripTags((prev) =>
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        );
                    }}
                    multiSelect={true}
                    testIDPrefix="route-roadtrip"
                />

                <ChipSelector
                    label="חוויה"
                    items={EXPERIENCE_TAGS.map(getLabel)}
                    selectedValue={experienceTags}
                    onSelect={(tag) => {
                        setExperienceTags((prev) =>
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        );
                    }}
                    multiSelect={true}
                    testIDPrefix="route-experience"
                />

                <TouchableOpacity
                    style={[buttons.submit, submitting && buttons.disabled]}
                    onPress={addRoute}
                    disabled={submitting}
                    testID="route-submit"
                >
                    {submitting ? (
                        <ActivityIndicator color={colors.white} />
                    ) : (
                        <Text style={buttons.submitText}>
                            {routeToEdit ? "שמור שינויים" : "פרסם מסלול"}
                        </Text>
                    )}
                </TouchableOpacity>
            </ScrollView>

            <DayEditorModal
                visible={isDayModalVisible}
                onClose={() => setDayModalVisible(false)}
                onSave={handleSaveDay}
                dayIndex={editingDayIndex !== null ? editingDayIndex : 0}
                initialData={editingDayIndex !== null ? tripDays[editingDayIndex] : {}}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.white || '#FFFFFF',
    },
    scrollContent: { padding: spacing.lg, paddingBottom: 40 },
    screenTitle: {
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'right',
        marginBottom: spacing.lg,
        color: colors.textPrimary || '#111827',
    },
    fieldLabel: {
        textAlign: 'right',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
        color: colors.textPrimary || '#111827',
    },
});
