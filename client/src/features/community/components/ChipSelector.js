import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { tags, colors } from '../../../styles';

const ChipSelector = ({
  label,
  items,
  selectedValue,
  onSelect,
  multiSelect = false
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeOnSelect = typeof onSelect === 'function' ? onSelect : () => {};

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
        {safeItems.map((item) => {
          const active = isSelected(item);
          return (
            <TouchableOpacity
              key={String(item)}
              style={[tags.chip, active && tags.chipSelected]}
              onPress={() => safeOnSelect(item)}
            >
              <Text style={[tags.chipText, active && tags.chipTextSelected]}>
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
