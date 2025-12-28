import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Import global styles to ensure consistency across the app
import { colors, forms } from '../../../styles'; 

const SelectField = ({ 
  label, 
  value, 
  placeholder, 
  onPress, 
  disabled = false, 
  style 
}) => {
  return (
    <View style={[styles.container, style]}>
      {/* Label: We use the global 'forms.label' for font/color consistency,
        but override alignment to right since it's specific here.
      */}
      <Text style={[forms.label, styles.labelOverride]}>{label}</Text>
      
      <TouchableOpacity 
        style={[
            styles.button, 
            disabled && styles.disabledButton
        ]} 
        onPress={onPress}
        disabled={disabled}
      >
        {/* Icon on the left */}
        <Ionicons 
          name="chevron-down" 
          size={20} 
          color={colors.textSecondary || "#666"} 
        />

        {/* Text on the right (Value or Placeholder) */}
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
    flex: 1, 
  },
  // Specific override for this component's label alignment
  labelOverride: {
    textAlign: "right", 
  },
  button: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    
    // Using global colors for theme consistency
    borderWidth: 1,
    borderColor: colors.border || '#e8e8e8', 
    backgroundColor: colors.background || '#fff', 
    borderRadius: 12, 
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.5, 
    backgroundColor: colors.borderLight || '#f5f5f5'
  },
  valueText: {
    color: colors.textPrimary || '#000', 
    fontSize: 16,
    textAlign: 'right', 
  },
  placeholderText: {
    color: colors.placeholder || '#a0a0a0', 
    fontSize: 16,
    textAlign: 'right',
  }
});

export default SelectField;