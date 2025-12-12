import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../styles';

export const TimelineItem = ({ day, index, isLast, onPress }) => {
    return (
        <View style={styles.dayContainer}>
            {!isLast && (
                <View style={styles.connector}>
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
                style={styles.dayPin}
                onPress={onPress}
            >
                <Ionicons name="location" size={32} color={colors.info} />
                <Text style={styles.dayNumber}>{index + 1}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={styles.dayPreview}
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

const styles = StyleSheet.create({
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
        color: colors.white,
        backgroundColor: colors.info,
        borderRadius: 10,
        width: 20,
        height: 20,
        textAlign: 'center',
        lineHeight: 20
    },
    dayPreview: {
        flex: 1,
        backgroundColor: colors.background,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border
    }
});
