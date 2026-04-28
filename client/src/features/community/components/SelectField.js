import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Import global styles to ensure consistency across the app
import { colors, forms, selectFieldStyles as styles } from '../../../styles';

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



export default SelectField;
