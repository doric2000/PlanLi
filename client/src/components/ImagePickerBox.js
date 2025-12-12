import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles';

/**
 * Reusable image picker box component.
 * Displays either a selected image or a placeholder with camera icon.
 * 
 * SOLID Principles:
 * - S: Single responsibility - only handles image display/placeholder UI
 * - O: Open for extension via style props and customization options
 * 
 * @param {Object} props
 * @param {string} props.imageUri - URI of the selected image (null shows placeholder)
 * @param {Function} props.onPress - Callback when box is pressed
 * @param {string} props.placeholderText - Text to show in placeholder
 * @param {string} props.iconName - Ionicons icon name (default: "camera")
 * @param {number} props.iconSize - Icon size (default: 40)
 * @param {string} props.iconColor - Icon color (default: "#ccc")
 * @param {number} props.height - Box height (default: 200)
 * @param {Object} props.style - Additional container styles
 * @param {Object} props.imageStyle - Additional image styles
 * @param {boolean} props.disabled - Whether the box is disabled
 */
export const ImagePickerBox = ({
    imageUri,
    onPress,
    placeholderText = "Tap to add photo",
    iconName = "camera",
    iconSize = 40,
    iconColor = "#ccc",
    height = 200,
    style,
    imageStyle,
    disabled = false,
}) => {
    return (
        <TouchableOpacity
            style={[styles.container, { height }, style]}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.7}
        >
            {imageUri ? (
                <Image
                    source={{ uri: imageUri }}
                    style={[styles.image, imageStyle]}
                    resizeMode="cover"
                />
            ) : (
                <View style={styles.placeholder}>
                    <Ionicons name={iconName} size={iconSize} color={iconColor} />
                    <Text style={[styles.placeholderText, { color: iconColor }]}>
                        {placeholderText}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: colors.borderLight || '#F1F5F9',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border || '#E2E8F0',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    placeholder: {
        alignItems: 'center',
    },
    placeholderText: {
        marginTop: 10,
        fontSize: 14,
    },
});

export default ImagePickerBox;
