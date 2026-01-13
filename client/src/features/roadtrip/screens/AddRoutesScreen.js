import { useState, useEffect } from "react";
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
import { TagSelector } from '../../../components/TagSelector';
import { useBackButton } from '../../../hooks/useBackButton';
import { getUserTier } from '../../../utils/userTier';

/**
 * Screen for adding/editing a route.
 * Aligned with the new dynamic Constants structure.
 */
export default function AddRoutesScreen({ navigation, route }) {
    // Setup back button
    useBackButton(navigation, { title: route?.params?.routeToEdit ? "Edit Route" : "Create Route" });

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
        Alert.alert("Delete Day", `Remove Day ${index + 1}?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
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
            Alert.alert("Error", "User must be authenticated!");
            return;
        }
        if (!title || !days || !places.length || !distance || !desc) {
            Alert.alert("Error", "Please fill in all required fields.");
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
                Alert.alert("Success", "Route updated!");
            } else {
                await addDoc(collection(db, "routes"), {
                    ...routeData,
                    createdAt: serverTimestamp(),
                });
                Alert.alert("Success", "Route added!");
            }
            navigation.goBack();
        } catch (e) {
            console.error("Firestore Error:", e);
            Alert.alert("Error", "Failed to save route data.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ScrollView
            style={common.container}
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={{ paddingBottom: 120 }}
        >
            <View style={{ padding: 20 }}>
                {/* Basic Details */}
                <FormInput value={title} onChangeText={setTitle} placeholder='Title' />
                <FormInput value={days} onChangeText={setDays} placeholder='Total Days' keyboardType='numeric' />
                
                {/* Day Logic */}
                <DayList
                    days={tripDays}
                    onAdd={() => { setEditingDayIndex(tripDays.length); setDayModalVisible(true); }}
                    onEdit={(index) => { setEditingDayIndex(index); setDayModalVisible(true); }}
                    onDelete={handleDeleteDay}
                />

                <PlacesInput places={places} setPlaces={setPlaces} />
                
                <FormInput
                    value={distance}
                    onChangeText={setDistance}
                    placeholder='Distance (km)'
                    keyboardType='numeric'
                />
                
                <FormInput
                    value={desc}
                    onChangeText={setDesc}
                    placeholder='Description'
                    multiline
                    style={{ minHeight: 120 }}
                />

                {/* --- Tag Selectors (Linked to Constants) --- */}
                
                <TagSelector
                    label='Difficulty (Single)'
                    tags={DIFFICULTY_TAGS.map(getLabel)}
                    selected={difficultyTag}
                    onSelect={setDifficultyTag}
                />

                <TagSelector
                    label='Travel Style (Single)'
                    tags={TRAVEL_STYLE_TAGS.map(getLabel)}
                    selected={travelStyleTag}
                    onSelect={setTravelStyleTag}
                />

                <TagSelector
                    label='Road Trip Tags (Multi)'
                    tags={ROAD_TRIP_TAGS.map(getLabel)}
                    selected={roadTripTags}
                    onSelect={setRoadTripTags}
                    multi={true}
                />

                <TagSelector
                    label='Experience Tags (Multi)'
                    tags={EXPERIENCE_TAGS.map(getLabel)}
                    selected={experienceTags}
                    onSelect={setExperienceTags}
                    multi={true}
                />

                {/* Submission */}
                <TouchableOpacity
                    style={[buttons.submit, submitting && { opacity: 0.7 }]}
                    onPress={addRoute}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color={colors.white} />
                    ) : (
                        <Text style={buttons.submitText}>
                            {routeToEdit ? "Update Route" : "Add Route"}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Day Editor Component */}
            <DayEditorModal
                visible={isDayModalVisible}
                onClose={() => setDayModalVisible(false)}
                onSave={handleSaveDay}
                dayIndex={editingDayIndex !== null ? editingDayIndex : 0}
                initialData={editingDayIndex !== null ? tripDays[editingDayIndex] : {}}
            />
        </ScrollView>
    );
}