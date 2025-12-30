import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FilterModal from './FilterModal';
import { common, spacing, colors } from '../styles';
import { CATEGORY_TAGS, PRICE_TAGS } from '../constants/Constatns';

// --- Import New Modular Components ---
import ChipSelector from '../features/community/components/ChipSelector';
import { FormInput } from './FormInput';

export default function RecommendationsFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  onClear,
}) {
  const current = filters || {};

  // Local State
  const [tempDestination, setTempDestination] = useState('');
  const [tempCategories, setTempCategories] = useState([]);
  const [tempBudgets, setTempBudgets] = useState([]);

  // Sync state when modal opens
  useEffect(() => {
    if (!visible) return;
    setTempDestination(current.destination || '');
    setTempCategories(Array.isArray(current.categories) ? current.categories : []);
    setTempBudgets(Array.isArray(current.budgets) ? current.budgets : []);
  }, [visible, filters]);

  // --- Toggle Logic for Multi-Select ---
  // ChipSelector returns the clicked item, we need to manage the array add/remove logic
  const toggleCategory = (item) => {
    setTempCategories((prev) => {
      if (prev.includes(item)) return prev.filter((i) => i !== item);
      return [...prev, item];
    });
  };

  const toggleBudget = (item) => {
    setTempBudgets((prev) => {
      if (prev.includes(item)) return prev.filter((i) => i !== item);
      return [...prev, item];
    });
  };

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
      title="סינון המלצות"
      onClose={onClose}
      onClear={onClear}
      onApply={handleApply}
    >
      {/* 1. Destination Input using FormInput */}
      <View style={styles.section}>
        <Text style={[common.modalLabel, { textAlign: 'right' }]}>יעד / עיר / מדינה</Text>
        <FormInput
          placeholder="תל אביב, יוון, תאילנד..."
          value={tempDestination}
          onChangeText={setTempDestination}
          textAlign="right"
        />
      </View>

      {/* 2. Categories using ChipSelector */}
      <ChipSelector
        label="קטגוריה"
        items={CATEGORY_TAGS}
        selectedValue={tempCategories} // Array
        onSelect={toggleCategory}
        multiSelect={true}
      />

      {/* 3. Budget using ChipSelector */}
      <ChipSelector
        label="תקציב"
        items={PRICE_TAGS}
        selectedValue={tempBudgets} // Array
        onSelect={toggleBudget}
        multiSelect={true}
      />

    </FilterModal>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  }
});