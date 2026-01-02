import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { tags as tagsStyle } from '../styles';

export default function MultiSelectChips({
  label,
  options = [],
  selected = [],
  onChange,
  styleVariant = 'filter', // 'filter' | 'budget'
}) {
  const sel = Array.isArray(selected) ? selected : [];

  const chipStyle = styleVariant === 'budget' ? tagsStyle.budgetChip : tagsStyle.filterChip;
  const chipSelectedStyle = styleVariant === 'budget' ? tagsStyle.budgetChipSelected : tagsStyle.filterChipSelected;
  const chipTextStyle = styleVariant === 'budget' ? tagsStyle.budgetChipText : tagsStyle.filterChipText;
  const chipTextSelectedStyle = styleVariant === 'budget' ? tagsStyle.budgetChipTextSelected : tagsStyle.filterChipTextSelected;

  const toggle = (value) => {
    const next = sel.includes(value) ? sel.filter((x) => x !== value) : [...sel, value];
    onChange?.(next);
  };

  return (
    <View style={{ marginTop: 8 }}>
      {!!label && <Text style={tagsStyle.sectionLabel}>{label}</Text>}

      <View style={tagsStyle.chipRow}>
        {options.map((opt) => {
          const isSelected = sel.includes(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[chipStyle, isSelected && chipSelectedStyle]}
              onPress={() => toggle(opt)}
              activeOpacity={0.85}
            >
              <Text style={[chipTextStyle, isSelected && chipTextSelectedStyle]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
