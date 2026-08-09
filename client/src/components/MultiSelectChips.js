import React from 'react';
import { View } from 'react-native';
import AppText from "./AppText";
import CompactChip from './CompactChip';
import { tags as tagsStyle } from '../styles';

export default function MultiSelectChips({
  label,
  options = [],
  selected = [],
  onChange,
  styleVariant = 'filter', // 'filter' | 'budget'
}) {
  const sel = Array.isArray(selected) ? selected : [];

  const toggle = (value) => {
    const next = sel.includes(value) ? sel.filter((x) => x !== value) : [...sel, value];
    onChange?.(next);
  };

  return (
    <View style={{ marginTop: 8 }}>
      {!!label && <AppText style={tagsStyle.sectionLabel}>{label}</AppText>}

      <View style={tagsStyle.chipRow}>
        {options.map((opt) => {
          const isSelected = sel.includes(opt);
          return (
            <CompactChip
              key={opt}
              label={opt}
              selected={isSelected}
              onPress={() => toggle(opt)}
            />
          );
        })}
      </View>
    </View>
  );
}
