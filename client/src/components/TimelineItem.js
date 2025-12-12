import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, common } from '../styles';

/**
 * TimelineItem - A visual timeline component for displaying trip days.
 * 
 * This component shows a single day in a vertical timeline format with:
 * - A location pin icon with the day number
 * - A preview card with the day's description
 * - A dashed connector line to the next day (except for the last item)
 * 
 * USE THIS COMPONENT to display trip itineraries or multi-day plans
 * in a visual, easy-to-follow timeline format.
 * 
 * @param {Object} day - The day data object containing description and other info
 * @param {number} index - The zero-based index of this day (used to show "Day 1", "Day 2", etc.)
 * @param {boolean} isLast - If true, hides the connector line (for the last day)
 * @param {function} onPress - Function to call when user taps the day (to view details)
 * 
 * @example
 * {tripDays.map((day, index) => (
 *   <TimelineItem
 *     key={index}
 *     day={day}
 *     index={index}
 *     isLast={index === tripDays.length - 1}
 *     onPress={() => openDayDetails(index)}
 *   />
 * ))}
 */
export const TimelineItem = ({ day, index, isLast, onPress }) => {
    return (
        <View style={common.timelineItem}>
            {!isLast && (
                <View style={common.timelineConnector}>
                    <Svg height="60" width="2">
                        <Path
                            d="M 1 0 L 1 60"
                            stroke={colors.border}
                            strokeWidth="2"
                            strokeDasharray="4, 4"
                        />
                    </Svg>
                </View>
            )}

            <TouchableOpacity 
                style={common.timelinePin}
                onPress={onPress}
            >
                <Ionicons name="location" size={32} color={colors.info} />
                <Text style={common.timelineDayNumber}>{index + 1}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={common.timelinePreview}
                onPress={onPress}
            >
                <Text style={{ ...typography.h4, fontSize: 16, marginBottom: 4 }}>Day {index + 1}</Text>
                <Text numberOfLines={2} style={typography.bodySmall}>
                    {day.description || "Tap to view details"}
                </Text>
            </TouchableOpacity>
        </View>
    );
};
