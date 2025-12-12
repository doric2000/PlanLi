import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PlacesRoute from "../../components/PlacesRoute";
import { Ionicons } from '@expo/vector-icons';
import DayViewModal from '../../components/DayViewModal';
import { useBackButton } from '../../hooks/useBackButton';
import { colors, common, tags as tagsStyle, typography } from "../../styles";
import { Avatar } from "../../components/Avatar";
import { TimelineItem } from "../../components/TimelineItem";

const { width } = Dimensions.get('window');

export default function RouteDetailScreen({ route, navigation }) {
    const { routeData } = route.params;
    const [selectedDay, setSelectedDay] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    useBackButton(navigation);

    const tripDays = routeData.tripDaysData || [];

    const handleDayPress = (index) => {
        setSelectedDay(index);
        setModalVisible(true);
    };

    // Get display name from user object
    let displayUser = "Unknown";
    let userPhoto = null;
    if (routeData.user) {
        if (typeof routeData.user === "object") {
            displayUser = routeData.user.displayName || routeData.user.email || "Anonymous";
            userPhoto = routeData.user.photoURL;
        } else {
            displayUser = routeData.user;
        }
    }

    // Prepare places array
    const places = Array.isArray(routeData.places) ? routeData.places : [];

    // Collect all tags
    const allTags = [
        ...(routeData.tags || []),
        routeData.difficultyTag,
        routeData.travelStyleTag,
        ...(routeData.roadTripTags || []),
        ...(routeData.experienceTags || [])
    ].filter(Boolean);

    return (
        <SafeAreaView style={common.container}>
            <ScrollView>
                {/* Header Section */}
                <View style={styles.headerSection}>
                    <Text style={typography.h1}>{routeData.Title}</Text>
                    <View style={styles.authorRow}>
                        <Avatar photoURL={userPhoto} displayName={displayUser} size={24} />
                        <Text style={typography.meta}>by {displayUser}</Text>
                    </View>
                    <Text style={{ ...typography.body, marginBottom: 16 }}>{routeData.desc}</Text>
                    
                    <View style={styles.metaRow}>
                        <Text style={typography.meta}>📅 {routeData.days} days</Text>
                        <Text style={typography.meta}>📍 {routeData.distance} km</Text>
                    </View>

                    {/* Places with Arrows - Replace the old section */}
                    {places.length > 0 && (
                        <View style={styles.placesSection}>
                            <Text style={styles.subsectionTitle}>Route</Text>
                            <PlacesRoute places={places} style={{ marginTop: 8 }} />
                        </View>
                    )}

                    {/* All Tags */}
                    {allTags.length > 0 && (
                        <View style={styles.tagsSection}>
                            <Text style={styles.subsectionTitle}>Tags</Text>
                            <View style={styles.tagsContainer}>
                                {allTags.map((tag, idx) => (
                                    <View key={idx} style={tagsStyle.itemSelected}>
                                        <Text style={tagsStyle.textSelected}>#{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                {/* Trip Timeline */}
                {tripDays.length > 0 && (
                    <View style={styles.timelineSection}>
                        <Text style={{ ...typography.h3, marginBottom: 20 }}>Trip Itinerary</Text>
                        
                        <View style={styles.timeline}>
                            {tripDays.map((day, index) => (
                                <TimelineItem
                                    key={index}
                                    day={day}
                                    index={index}
                                    isLast={index === tripDays.length - 1}
                                    onPress={() => handleDayPress(index)}
                                />
                            ))}
                        </View>
                    </View>
                )}

                {tripDays.length === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No daily itinerary available</Text>
                    </View>
                )}
            </ScrollView>

            <DayViewModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                dayData={selectedDay !== null ? tripDays[selectedDay] : null}
                dayIndex={selectedDay}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    headerSection: {
        backgroundColor: colors.white,
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12
    },
    metaRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16
    },
    placesSection: {
        marginBottom: 16
    },
    subsectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textLight,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8
    },
    tagsSection: {
        marginTop: 8
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    timelineSection: {
        padding: 20,
        backgroundColor: colors.white,
        marginTop: 8
    },
    timeline: {
        paddingLeft: 10
    },
    emptyState: {
        padding: 40,
        alignItems: 'center'
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14
    }
});