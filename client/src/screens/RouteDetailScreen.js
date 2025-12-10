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
 import PlacesRoute from "../components/PlacesRoute";
import { Ionicons } from '@expo/vector-icons';
import DayViewModal from '../components/DayViewModal';
import { useBackButton } from '../hooks/useBackButton';
import Svg, { Path } from 'react-native-svg';

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
    if (routeData.user) {
        if (typeof routeData.user === "object") {
            displayUser = routeData.user.displayName || routeData.user.email || "Anonymous";
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
        <SafeAreaView style={styles.container}>
            <ScrollView>
                {/* Header Section */}
                <View style={styles.headerSection}>
                    <Text style={styles.title}>{routeData.Title}</Text>
                    <Text style={styles.author}>by {displayUser}</Text>
                    <Text style={styles.description}>{routeData.desc}</Text>
                    
                    <View style={styles.metaRow}>
                        <Text style={styles.metaItem}>📅 {routeData.days} days</Text>
                        <Text style={styles.metaItem}>📍 {routeData.distance} km</Text>
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
                                    <View key={idx} style={styles.tag}>
                                        <Text style={styles.tagText}>#{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                {/* Trip Timeline */}
                {tripDays.length > 0 && (
                    <View style={styles.timelineSection}>
                        <Text style={styles.sectionTitle}>Trip Itinerary</Text>
                        
                        <View style={styles.timeline}>
                            {tripDays.map((day, index) => (
                                <View key={index} style={styles.dayContainer}>
                                    {index < tripDays.length - 1 && (
                                        <View style={styles.connector}>
                                            <Svg height="60" width="2">
                                                <Path
                                                    d="M 1 0 L 1 60"
                                                    stroke="#CBD5E1"
                                                    strokeWidth="2"
                                                    strokeDasharray="4, 4"
                                                />
                                            </Svg>
                                        </View>
                                    )}

                                    <TouchableOpacity 
                                        style={styles.dayPin}
                                        onPress={() => handleDayPress(index)}
                                    >
                                        <Ionicons name="location" size={32} color="#0284C7" />
                                        <Text style={styles.dayNumber}>{index + 1}</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity 
                                        style={styles.dayPreview}
                                        onPress={() => handleDayPress(index)}
                                    >
                                        <Text style={styles.dayTitle}>Day {index + 1}</Text>
                                        <Text numberOfLines={2} style={styles.dayDescription}>
                                            {day.description || "Tap to view details"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
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

// ...existing styles remain the same...

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC'
    },
    headerSection: {
        backgroundColor: '#fff',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0'
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 8
    },
    author: {
        fontSize: 14,
        color: '#64748B',
        marginBottom: 12
    },
    description: {
        fontSize: 16,
        lineHeight: 24,
        color: '#334155',
        marginBottom: 16
    },
    metaRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16
    },
    metaItem: {
        fontSize: 14,
        color: '#64748B'
    },
    placesSection: {
        marginBottom: 16
    },
    subsectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748B',
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
    tag: {
        backgroundColor: '#E0F2FE',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16
    },
    tagText: {
        color: '#0284C7',
        fontSize: 12,
        fontWeight: '600'
    },
    timelineSection: {
        padding: 20,
        backgroundColor: '#fff',
        marginTop: 8
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 20
    },
    timeline: {
        paddingLeft: 10
    },
    dayContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 20,
        position: 'relative'
    },
    connector: {
        position: 'absolute',
        left: 15,
        top: 40,
        zIndex: -1
    },
    dayPin: {
        alignItems: 'center',
        marginRight: 16,
        position: 'relative'
    },
    dayNumber: {
        position: 'absolute',
        top: 6,
        fontSize: 12,
        fontWeight: '700',
        color: '#fff',
        backgroundColor: '#0284C7',
        borderRadius: 10,
        width: 20,
        height: 20,
        textAlign: 'center',
        lineHeight: 20
    },
    dayPreview: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0'
    },
    dayTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0F172A',
        marginBottom: 4
    },
    dayDescription: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 20
    },
    emptyState: {
        padding: 40,
        alignItems: 'center'
    },
    emptyText: {
        color: '#94A3B8',
        fontSize: 14
    }
});