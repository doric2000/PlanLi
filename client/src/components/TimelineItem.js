import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, common } from '../styles';

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
