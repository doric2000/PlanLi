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
import { Ionicons } from '@expo/vector-icons';
import PlacesRoute from '../components/PlacesRoute';
import DayViewModal from '../components/DayViewModal';
import { colors, common, tags as tagsStyle, typography, spacing } from '../../../styles';
import { Avatar } from '../../../components/Avatar';
import { TimelineItem } from '../../../components/TimelineItem';
import { useBackButton } from '../../../hooks/useBackButton';
import { useUserData } from '../../../hooks/useUserData';

const { width } = Dimensions.get('window');

/**
 * Screen for displaying details of a specific route.
 * Shows trip itinerary, places, tags, and user info.
 *
 * @param {Object} navigation - Navigation object.
 * @param {Object} route - Route object containing params.
 */
export default function RouteDetailScreen({ route, navigation }) {
    // Setup back button with hook
    useBackButton(navigation, { title: 'Route Details' });

    const { routeData } = route.params;
    const [selectedDay, setSelectedDay] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    const tripDays = routeData.tripDaysData || [];

    const handleDayPress = (index) => {
        setSelectedDay(index);
        setModalVisible(true);
    };

    // Get display name from user object
        // Use useUserData for author info
        const author = useUserData(routeData.userId);
        let displayUser = author.displayName || "Anonymous";
        let userPhoto = author.photoURL;

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
                        <View style={styles.metaItem}>
                            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                            <Text style={typography.meta}>{routeData.days} days</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <Ionicons name="map-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                            <Text style={typography.meta}>{routeData.distance} km</Text>
                        </View>
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
        padding: spacing.screenHorizontal,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md
    },
    metaRow: {
        flexDirection: 'row',
        gap: spacing.lg,
        marginBottom: spacing.lg
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    placesSection: {
        marginBottom: spacing.lg
    },
    subsectionTitle: {
        ...typography.caption,
        color: colors.textLight,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm
    },
    tagsSection: {
        marginTop: spacing.sm
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    timelineSection: {
        padding: spacing.screenHorizontal,
        backgroundColor: colors.white,
        marginTop: spacing.sm
    },
    timeline: {
        paddingLeft: 10
    },
    emptyState: {
        padding: spacing.xxxl,
        alignItems: 'center'
    },
    emptyText: {
        ...typography.bodySmall,
        color: colors.textMuted,
    }
});
