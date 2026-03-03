import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';

// ודא שהנתיבים האלה תואמים למבנה שלך (הם אמורים להיות מדויקים לפי מה שראיתי)
import { db } from '../../../config/firebase';
import { colors, common, buttons, spacing } from '../../../styles';
import { FormInput } from '../../../components/FormInput';
import ChipSelector from '../../community/components/ChipSelector';
import { DIFFICULTY_TAGS, TRAVEL_STYLE_TAGS } from '../../../constants/Constants';
import { useBackButton } from '../../../hooks/useBackButton';

export default function AiTripGeneratorScreen({ navigation }) {
    useBackButton(navigation, { title: "תכנון טיול חכם" });

    const [destination, setDestination] = useState('');
    const [days, setDays] = useState('');
    const [travelStyle, setTravelStyle] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [loading, setLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    const getLabel = (item) => (typeof item === 'object' ? item.label : item);

    const generateTrip = async () => {
        if (!destination || !days) {
            Alert.alert("חסרים פרטים", "אנא הזן יעד ומספר ימים כדי שנוכל לתכנן את הטיול.");
            return;
        }

        setLoading(true);

        try {
            // --- 1. משיכת המקומות מהדאטה-בייס (Firebase) ---
            console.log(`Searching for recommendations in: ${destination}`);
            const recommendationsRef = collection(db, 'recommendations');

            // שינינו כאן את 'city' ל-'location' כדי שיתאים בדיוק למסד הנתונים שלך
            const q = query(recommendationsRef, where('location', '==', destination));
            const querySnapshot = await getDocs(q);

            const availablePlaces = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                availablePlaces.push({
                    // אנחנו לוקחים בדיוק את השדות שראינו ב-AddRecommendationScreen
                    name: data.title || 'מקום ללא שם', 
                    description: data.description || '',
                    category: data.category || 'כללי',
                });
            });

            console.log(`Found ${availablePlaces.length} places in DB for ${destination}`);

            // אם אין לנו בכלל המלצות על היעד הזה, נעצור פה
            if (availablePlaces.length === 0) {
                Alert.alert(
                    "אין מספיק מידע", 
                    `לצערנו, לקהילה שלנו עדיין אין מספיק המלצות על ${destination} כדי לבנות מסלול. נסה יעד אחר!`
                );
                setLoading(false);
                return;
            }

            // --- 2. שליחת הבקשה המקורקעת לשרת ה-AI ---
            // 🛑 שים לב: החלף את YOUR_IP_ADDRESS בכתובת ה-IP המקומית של המחשב שלך!
            const response = await fetch('http://10.0.0.47:8082/api/generate-trip', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    destination,
                    days: parseInt(days, 10),
                    travelStyle,
                    difficulty,
                    availablePlaces // רשימת המקומות מה-Firebase נשלחת לשרת
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Server error');
            }

            const aiTripData = await response.json();

            // --- 3. הצגת מסך סקירה לפני מעבר --- 
            setPreviewData({
                input: availablePlaces,
                output: aiTripData,
            });

        } catch (error) {
            console.error("AI Generation Error:", error);
            Alert.alert("שגיאה", "לא הצלחנו לייצר את המסלול כרגע. נסה שוב מאוחר יותר.");
        } finally {
            setLoading(false);
        }
    };

    const renderReview = () => {
        const ai = previewData?.output || {};
        const daysSummary = Array.isArray(ai.tripDaysData) ? ai.tripDaysData : [];

        return (
            <View style={[common.container, styles.container]}>
                <ScrollView keyboardShouldPersistTaps='handled' contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.sectionTitle}>סקירה לפני שמירה</Text>

                    <View style={styles.reviewBlock}>
                        <Text style={styles.reviewHeading}>Source Data from Database</Text>
                        {Array.isArray(previewData?.input) && previewData.input.length > 0 ? (
                            previewData.input.map((place, idx) => (
                                <Text key={idx} style={styles.reviewText}>• {place.name || place.title || 'ללא שם'}</Text>
                            ))
                        ) : (
                            <Text style={styles.reviewText}>No places received</Text>
                        )}
                    </View>

                    <View style={styles.reviewBlock}>
                        <Text style={styles.reviewHeading}>AI Result</Text>
                        <Text style={styles.reviewText}>כותרת: {ai.Title || 'ללא כותרת'}</Text>
                        {daysSummary.length > 0 ? (
                            daysSummary.map((day, idx) => (
                                <Text key={idx} style={styles.reviewText}>
                                    יום {day.dayNumber || idx + 1}: {day.title || day.description || 'ללא תיאור'}
                                </Text>
                            ))
                        ) : (
                            <Text style={styles.reviewText}>אין ימי מסלול</Text>
                        )}
                    </View>

                    <View style={styles.reviewBlock}>
                        <Text style={styles.reviewHeading}>Raw JSON (debug)</Text>
                        <Text style={styles.jsonBlock}>{JSON.stringify(previewData, null, 2)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: spacing.lg }}>
                        <TouchableOpacity
                            style={[buttons.secondary, { flex: 1, marginLeft: spacing.sm }]}
                            onPress={() => setPreviewData(null)}
                        >
                            <Text style={buttons.secondaryText}>חזרה לעריכה</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[buttons.submit, { flex: 1, marginRight: spacing.sm }]}
                            onPress={() => navigation.navigate('AddRoutesScreen', { initialData: ai })}
                        >
                            <Text style={buttons.submitText}>אישור והמשך</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>
        );
    };

    if (previewData) {
        return renderReview();
    }

    return (
        <View style={[common.container, styles.container]}>
            <ScrollView keyboardShouldPersistTaps='handled' contentContainerStyle={styles.scrollContent}>
                
                <Text style={styles.description}>
                    ספר לנו לאן תרצה לנסוע, והבינה המלאכותית שלנו תבנה עבורך מסלול מפורט על בסיס המלצות הקהילה!
                </Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.fieldLabel}>לאן נוסעים?</Text>
                    <FormInput 
                        placeholder="לדוגמה: אמסטרדם, יפן..." 
                        value={destination} 
                        onChangeText={setDestination} 
                        textAlign="right"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.fieldLabel}>לכמה ימים?</Text>
                    <FormInput 
                        placeholder="לדוגמה: 5" 
                        value={days} 
                        onChangeText={setDays} 
                        keyboardType='numeric' 
                        textAlign="right"
                    />
                </View>

                <ChipSelector
                    label="סגנון טיול מועדף"
                    items={TRAVEL_STYLE_TAGS.map(getLabel)}
                    selectedValue={travelStyle}
                    onSelect={setTravelStyle}
                    multiSelect={false}
                />

                <ChipSelector
                    label="רמת קושי"
                    items={DIFFICULTY_TAGS.map(getLabel)}
                    selectedValue={difficulty}
                    onSelect={setDifficulty}
                    multiSelect={false}
                />

                <TouchableOpacity
                    style={[buttons.submit, loading && buttons.disabled, { marginTop: spacing.xl }]}
                    onPress={generateTrip}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color={colors.white} />
                    ) : (
                        <Text style={buttons.submitText}>✨ צור לי מסלול חכם</Text>
                    )}
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.white || '#FFFFFF',
    },
    scrollContent: { 
        padding: spacing.lg, 
        paddingBottom: 40 
    },
    description: {
        fontSize: 16,
        textAlign: 'right',
        color: colors.textSecondary || '#4B5563',
        marginBottom: spacing.xl,
        lineHeight: 22,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: spacing.md,
        textAlign: 'right',
        color: colors.textPrimary || '#111827',
    },
    reviewBlock: {
        marginBottom: spacing.lg,
        padding: spacing.md,
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    reviewHeading: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: spacing.sm,
        textAlign: 'right',
        color: colors.textPrimary || '#111827',
    },
    reviewText: {
        fontSize: 14,
        color: colors.textSecondary || '#4B5563',
        textAlign: 'right',
        marginBottom: 4,
    },
    jsonBlock: {
        fontSize: 12,
        color: '#0f172a',
        backgroundColor: '#e2e8f0',
        padding: spacing.sm,
        borderRadius: 8,
        fontFamily: 'Menlo',
        textAlign: 'left',
    },
    inputGroup: {
        marginBottom: spacing.lg,
    },
    fieldLabel: {
        textAlign: 'right',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
        color: colors.textPrimary || '#111827',
    },
});
