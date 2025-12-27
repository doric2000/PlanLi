import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import FilterModal from './FilterModal';
import MultiSelectChips from './MultiSelectChips';
import { common, spacing } from '../styles';
import { CATEGORY_TAGS, PRICE_TAGS } from '../constants/Constatns';


export default function RecommendationsFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  onClear,
}) {
  const current = filters || {};

  const [tempDestination, setTempDestination] = useState('');
  const [tempCategories, setTempCategories] = useState([]);
  const [tempBudgets, setTempBudgets] = useState([]);

  useEffect(() => {
    if (!visible) return;
    setTempDestination(current.destination || '');
    setTempCategories(Array.isArray(current.categories) ? current.categories : []);
    setTempBudgets(Array.isArray(current.budgets) ? current.budgets : []);
  }, [visible]);

  const handleApply = () => {
    onApply?.({
      destination: tempDestination,
      categories: tempCategories,
      budgets: tempBudgets,
    });
  };

  return (
    <FilterModal
      visible={visible}
      title="מסננים"
      onClose={onClose}
      onClear={onClear}
      onApply={handleApply}
    >
      <Text style={[common.modalLabel, { textAlign: 'right' }]}>יעד / עיר / מדינה</Text>
      <TextInput
        style={[common.modalInput, { textAlign: 'right' }]}
        placeholder="תל אביב, יוון, תאילנד..."
        value={tempDestination}
        onChangeText={setTempDestination}
      />

      <View style={{ marginTop: spacing.lg }}>
        <MultiSelectChips
          label="קטגוריה"
          options={CATEGORY_TAGS}
          selected={tempCategories}
          onChange={setTempCategories}
          styleVariant="filter"
        />

        <MultiSelectChips
          label="תקציב"
          options={PRICE_TAGS}
          selected={tempBudgets}
          onChange={setTempBudgets}
          styleVariant="budget"
        />
      </View>
    </FilterModal>
  );
}
