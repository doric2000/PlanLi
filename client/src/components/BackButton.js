import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles';

/**
 * BackButton - A beautiful, reusable back button component
 * 
 * Features:
 * - Semi-transparent circular background
 * - Chevron-back icon
 * - Works with any background (light or dark)
 * 
 * @param {Object} props
 * @param {string} [props.color='white'] - Icon color ('white', 'dark', or custom color)
 * @param {string} [props.variant='overlay'] - Button style variant ('overlay', 'solid', 'ghost')
 * @param {number} [props.size=24] - Icon size
 * @param {Function} [props.onPress] - Custom onPress handler (defaults to navigation.goBack)
 * @param {Object} [props.style] - Additional styles for the button container
 * 
 * @example
 * // Basic usage (white icon with overlay background)
 * <BackButton />
 * 
 * @example
 * // Dark variant for light backgrounds
 * <BackButton color="dark" variant="solid" />
 * 
 * @example
 * // Custom onPress handler
 * <BackButton onPress={() => navigation.navigate('Home')} />
 */
export const BackButton = ({ 
  color = 'white', 
  variant = 'overlay', 
  size = 24, 
  onPress, 
  style 
}) => {
  const navigation = useNavigation();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      navigation.goBack();
    }
  };

  const getIconColor = () => {
    if (color === 'white') return colors.white;
    if (color === 'dark') return colors.textPrimary;
    return color;
  };

  const getBackgroundStyle = () => {
    switch (variant) {
      case 'overlay':
        return { backgroundColor: 'rgba(255,255,255,0.2)' };
      case 'solid':
        return { backgroundColor: colors.white };
      case 'ghost':
        return { backgroundColor: 'transparent' };
      default:
        return { backgroundColor: 'rgba(255,255,255,0.2)' };
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.button, getBackgroundStyle(), style]}
      activeOpacity={0.7}
    >
      <Ionicons name="chevron-back" size={size} color={getIconColor()} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BackButton;
