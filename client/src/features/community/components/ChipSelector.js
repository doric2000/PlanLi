import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { tags, colors } from '../../../styles';

const ChipSelector = ({
  label,
  items,
  selectedValue,
  onSelect,
  multiSelect = false,
  getItemTheme,
  testIDPrefix,
  getItemTestId,
}) => {

  const safeItems = Array.isArray(items) ? items : []; 
  

  const isSelected = (item) => {
    if (multiSelect) {
      return Array.isArray(selectedValue) && selectedValue.includes(item);
    }
    return selectedValue === item;
  };

  return (
    <View style={styles.inputWrapper}>
      {label && <Text style={styles.label}>{label}</Text>}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
      >
        {safeItems.map((item, index) => {
          const active = isSelected(item);
          const theme = typeof getItemTheme === 'function' ? getItemTheme(item) : null;
          const resolvedTestId = typeof getItemTestId === 'function'
            ? getItemTestId(item, index)
            : (testIDPrefix ? `${testIDPrefix}-${index}` : undefined);
          return (
            <TouchableOpacity
              key={String(item)}
              style={[
                tags.chip,
                active && tags.chipSelected,
                active && theme
                  ? {
                      backgroundColor: theme.backgroundColor,
                      borderColor: theme.borderColor,
                      borderWidth: 1,
                    }
                  : null,
              ]}
              onPress={() => onSelect(item)}
              testID={resolvedTestId}
            >
              <Text
                style={[
                  tags.chipText,
                  active && tags.chipTextSelected,
                  active && theme ? { color: theme.textColor, fontWeight: '700' } : null,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  inputWrapper: {
    marginBottom: 20,
  },
  label: {
    textAlign: "right",
    marginBottom: 8,
    fontWeight: 'bold',
    fontSize: 14,
    color: colors.textPrimary || '#333',
  },
  chipScroll: {
    flexDirection: 'row-reverse',
  }
});

export default ChipSelector;
