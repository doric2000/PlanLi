import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
// Importing global colors to maintain consistency
import { colors, segmentedControlStyles as styles } from '../../../styles';

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
  onSelect,
  getItemTheme,
  testIDPrefix,
  getItemTestId,
}) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View style={styles.row}>
        {items.map((item, index) => {
          const isSelected = selectedValue === item;
          const theme = typeof getItemTheme === 'function' ? getItemTheme(item) : null;
          const resolvedTestId = typeof getItemTestId === 'function'
            ? getItemTestId(item, index)
            : (testIDPrefix ? `${testIDPrefix}-${index}` : undefined);

          const selectedButtonStyle = isSelected
            ? {
                backgroundColor: theme?.backgroundColor || styles.buttonSelected.backgroundColor,
                borderColor: theme?.borderColor || styles.buttonSelected.backgroundColor,
              }
            : null;

          const selectedTextStyle = isSelected
            ? {
                color: theme?.textColor || styles.textSelected.color,
              }
            : null;

          return (
            <TouchableOpacity
              key={item}
              style={[
                styles.button,
                isSelected && styles.buttonSelected,
                selectedButtonStyle,
              ]}
              onPress={() => onSelect(item)}
              testID={resolvedTestId}
            >
              <Text style={[
                styles.text,
                isSelected && styles.textSelected,
                selectedTextStyle,
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



export default SegmentedControl;
