import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buttons } from '../styles';

/**
 * Floating Action Button (FAB) component
 * @param {Object} props
 * @param {function} props.onPress - Function to call when pressed
 * @param {string} [props.icon] - Ionicons icon name (default: 'add')
 * @param {number} [props.size] - Icon size (default: 32)
 * @param {string} [props.color] - Icon color (default: '#fff')
 * @param {Object} [props.style] - Additional style for the button
 */
const FabButton = ({ onPress, icon = 'add', size = 32, color = '#fff', style }) => (
  <TouchableOpacity
    style={[buttons.fab, style]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Ionicons name={icon} size={size} color={color} />
  </TouchableOpacity>
);

export default FabButton;
