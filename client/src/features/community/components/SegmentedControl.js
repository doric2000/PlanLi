import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
// Importing global colors to maintain consistency
import { colors } from '../../../styles'; 

/**
 * A reusable component for selecting one value from a list of options.
 * Renders a row of buttons where only one can be active at a time.
 * * @param {string} label - Optional label above the control
 * @param {Array<string>} items - Array of options to display
 * @param {string} selectedValue - The currently selected value
 * @param {Function} onSelect - Callback function when an item is selected
 */
const SegmentedControl = ({ 
  label, 
  items, 
  selectedValue, 
  onSelect 
}) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <View style={styles.row}>
        {items.map((item) => {
          const isSelected = selectedValue === item;
          return (
            <TouchableOpacity
              key={item}
              style={[
                styles.button, 
                isSelected && styles.buttonSelected
              ]}
              onPress={() => onSelect(item)}
            >
              <Text style={[
                styles.text, 
                isSelected && styles.textSelected
              ]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    textAlign: "right",
    marginBottom: 8,
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333', 
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1, // Distribute width equally
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderLight || '#f0f0f0', 
    borderRadius: 8,
    marginHorizontal: 4, // Spacing between buttons
  },
  buttonSelected: {
    backgroundColor: colors.primary || '#2EC4B6', // Active color
  },
  text: {
    color: colors.textSecondary || '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  textSelected: {
    color: '#fff',
    fontWeight: 'bold',
  }
});

export default SegmentedControl;